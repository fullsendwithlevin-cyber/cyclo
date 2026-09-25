import { z } from "zod";
import { db } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors";
import type { Prisma, Task } from "@/lib/generated/prisma/client";
import { DataSource, TaskPriority, TaskStatus } from "@/lib/generated/prisma/enums";

export const taskInputSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().max(5000).nullish(),
  status: z.enum(TaskStatus).optional(),
  priority: z.enum(TaskPriority).optional(),
  dueDate: z.coerce.date().nullish(),
  estimatedMinutes: z.number().int().min(1).max(10_000).nullish(),
  projectId: z.string().nullish(),
  examId: z.string().nullish(),
  dependsOnIds: z.array(z.string()).max(50).optional(),
  source: z.enum(DataSource).optional(),
  sourceRef: z.string().max(500).nullish(),
});
export type TaskInput = z.infer<typeof taskInputSchema>;
export const taskPatchSchema = taskInputSchema.partial();

export const OPEN_STATUSES: TaskStatus[] = ["INBOX", "PLANNED", "IN_PROGRESS", "WAITING"];

const PRIORITY_WEIGHT: Record<TaskPriority, number> = { URGENT: 40, HIGH: 25, MEDIUM: 10, LOW: 0 };

/** Sortier-Score: Priorität + Dringlichkeit der Deadline. Höher = wichtiger. */
export function taskScore(t: Pick<Task, "priority" | "dueDate" | "status">, now = new Date()): number {
  let score = PRIORITY_WEIGHT[t.priority];
  if (t.dueDate) {
    const days = (t.dueDate.getTime() - now.getTime()) / 864e5;
    if (days < 0) score += 50;
    else if (days < 1) score += 35;
    else if (days < 3) score += 20;
    else if (days < 7) score += 10;
  }
  if (t.status === "IN_PROGRESS") score += 5;
  if (t.status === "WAITING") score -= 15;
  return score;
}

export interface TaskFilter {
  status?: TaskStatus[];
  projectId?: string;
  dueBefore?: Date;
  search?: string;
  limit?: number;
}

export async function listTasks(userId: string, f: TaskFilter = {}) {
  const where: Prisma.TaskWhereInput = {
    userId,
    status: f.status ? { in: f.status } : undefined,
    projectId: f.projectId,
    dueDate: f.dueBefore ? { lte: f.dueBefore } : undefined,
    OR: f.search
      ? [
          { title: { contains: f.search, mode: "insensitive" } },
          { description: { contains: f.search, mode: "insensitive" } },
        ]
      : undefined,
  };
  const tasks = await db.task.findMany({
    where,
    include: { project: { select: { id: true, name: true, color: true } }, dependsOn: { select: { id: true, title: true, status: true } } },
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
    take: Math.min(f.limit ?? 200, 500),
  });
  const now = new Date();
  return tasks.sort((a, b) => taskScore(b, now) - taskScore(a, now));
}

async function assertOwned(userId: string, refs: { projectId?: string | null; examId?: string | null; dependsOnIds?: string[] }) {
  if (refs.projectId && !(await db.project.findFirst({ where: { id: refs.projectId, userId }, select: { id: true } })))
    throw new AppError({ code: "NOT_FOUND", action: "Aufgabe speichern", reason: "Projekt nicht gefunden." });
  if (refs.examId && !(await db.exam.findFirst({ where: { id: refs.examId, userId }, select: { id: true } })))
    throw new AppError({ code: "NOT_FOUND", action: "Aufgabe speichern", reason: "Prüfung nicht gefunden." });
  if (refs.dependsOnIds?.length) {
    const n = await db.task.count({ where: { id: { in: refs.dependsOnIds }, userId } });
    if (n !== new Set(refs.dependsOnIds).size)
      throw new AppError({ code: "NOT_FOUND", action: "Aufgabe speichern", reason: "Abhängige Aufgabe nicht gefunden." });
  }
}

/** Prüft, ob `taskId` von einer der `dependsOnIds` (transitiv) abhängt → Zyklus. */
export async function wouldCreateCycle(taskId: string, dependsOnIds: string[]): Promise<boolean> {
  const seen = new Set<string>();
  const stack = [...dependsOnIds];
  while (stack.length) {
    const id = stack.pop()!;
    if (id === taskId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    const t = await db.task.findUnique({ where: { id }, select: { dependsOn: { select: { id: true } } } });
    for (const d of t?.dependsOn ?? []) stack.push(d.id);
  }
  return false;
}

export async function createTask(userId: string, raw: TaskInput) {
  const input = taskInputSchema.parse(raw);
  await assertOwned(userId, input);
  return db.task.create({
    data: {
      userId,
      title: input.title,
      description: input.description ?? null,
      status: input.status ?? (input.dueDate ? "PLANNED" : "INBOX"),
      priority: input.priority ?? "MEDIUM",
      dueDate: input.dueDate ?? null,
      estimatedMinutes: input.estimatedMinutes ?? null,
      projectId: input.projectId ?? null,
      examId: input.examId ?? null,
      source: input.source ?? "MANUAL",
      sourceRef: input.sourceRef ?? null,
      completedAt: input.status === "DONE" ? new Date() : null,
      dependsOn: input.dependsOnIds?.length ? { connect: input.dependsOnIds.map((id) => ({ id })) } : undefined,
    },
  });
}

export async function getTask(userId: string, id: string) {
  const task = await db.task.findFirst({ where: { id, userId }, include: { dependsOn: true, dependents: true, project: true } });
  if (!task) throw new AppError({ code: "NOT_FOUND", action: "Aufgabe laden", reason: "Aufgabe nicht gefunden." });
  return task;
}

export async function updateTask(userId: string, id: string, raw: z.infer<typeof taskPatchSchema>) {
  const patch = taskPatchSchema.parse(raw);
  const existing = await getTask(userId, id);
  await assertOwned(userId, patch);
  if (patch.dependsOnIds?.length && (await wouldCreateCycle(id, patch.dependsOnIds)))
    throw new AppError({
      code: "CONFLICT",
      action: "Aufgabe aktualisieren",
      reason: "Diese Abhängigkeit würde einen Zyklus erzeugen.",
      solution: "Abhängigkeiten prüfen.",
    });
  if (patch.status === "DONE") {
    const blocking = existing.dependsOn.filter((d) => d.status !== "DONE" && d.status !== "CANCELLED");
    if (blocking.length)
      throw new AppError({
        code: "CONFLICT",
        action: "Aufgabe abschließen",
        reason: `Offene Abhängigkeiten: ${blocking.map((b) => b.title).join(", ")}.`,
        solution: "Zuerst die abhängigen Aufgaben erledigen.",
      });
  }
  return db.task.update({
    where: { id },
    data: {
      title: patch.title,
      description: patch.description,
      status: patch.status,
      priority: patch.priority,
      dueDate: patch.dueDate,
      estimatedMinutes: patch.estimatedMinutes,
      projectId: patch.projectId,
      examId: patch.examId,
      completedAt: patch.status === undefined ? undefined : patch.status === "DONE" ? existing.completedAt ?? new Date() : null,
      dependsOn: patch.dependsOnIds ? { set: patch.dependsOnIds.map((d) => ({ id: d })) } : undefined,
    },
  });
}

export const completeTask = (userId: string, id: string) => updateTask(userId, id, { status: "DONE" });

export async function deleteTask(userId: string, id: string) {
  await getTask(userId, id);
  await db.task.delete({ where: { id } });
}
