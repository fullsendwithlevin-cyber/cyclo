import { z } from "zod";
import { db } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors";
import { ProjectStatus } from "@/lib/generated/prisma/enums";

export const projectInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(5000).nullish(),
  status: z.enum(ProjectStatus).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullish(),
  dueDate: z.coerce.date().nullish(),
});
export const projectPatchSchema = projectInputSchema.partial();

export async function listProjects(userId: string, includeArchived = false) {
  const projects = await db.project.findMany({
    where: { userId, status: includeArchived ? undefined : { not: "ARCHIVED" } },
    include: {
      _count: { select: { tasks: true, documents: true, events: true, notes: true } },
      tasks: { select: { status: true } },
      milestones: { select: { done: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
  return projects.map(({ tasks, milestones, ...p }) => ({
    ...p,
    progress: {
      tasksDone: tasks.filter((t) => t.status === "DONE").length,
      tasksTotal: tasks.filter((t) => t.status !== "CANCELLED").length,
      milestonesDone: milestones.filter((m) => m.done).length,
      milestonesTotal: milestones.length,
    },
  }));
}

export async function getProject(userId: string, id: string) {
  const project = await db.project.findFirst({
    where: { id, userId },
    include: {
      tasks: { orderBy: [{ status: "asc" }, { dueDate: { sort: "asc", nulls: "last" } }] },
      milestones: { orderBy: { dueDate: { sort: "asc", nulls: "last" } } },
      documents: { orderBy: { createdAt: "desc" }, take: 50 },
      events: { where: { end: { gte: new Date() } }, orderBy: { start: "asc" }, take: 50 },
      notes: { orderBy: { updatedAt: "desc" }, take: 50 },
      exams: { orderBy: { start: "asc" } },
      conversations: { orderBy: { updatedAt: "desc" }, take: 20, select: { id: true, title: true, updatedAt: true } },
    },
  });
  if (!project) throw new AppError({ code: "NOT_FOUND", action: "Projekt laden", reason: "Projekt nicht gefunden." });
  return project;
}

export async function createProject(userId: string, raw: z.infer<typeof projectInputSchema>) {
  const input = projectInputSchema.parse(raw);
  return db.project.create({ data: { userId, ...input, description: input.description ?? null, color: input.color ?? null, dueDate: input.dueDate ?? null } });
}

export async function updateProject(userId: string, id: string, raw: z.infer<typeof projectPatchSchema>) {
  const patch = projectPatchSchema.parse(raw);
  await getProject(userId, id);
  return db.project.update({ where: { id }, data: patch });
}

export async function deleteProject(userId: string, id: string) {
  await getProject(userId, id);
  await db.project.delete({ where: { id } });
}

export async function addMilestone(userId: string, projectId: string, title: string, dueDate?: Date | null) {
  await getProject(userId, projectId);
  return db.milestone.create({ data: { projectId, title, dueDate: dueDate ?? null } });
}

export async function setMilestoneDone(userId: string, milestoneId: string, done: boolean) {
  const m = await db.milestone.findFirst({ where: { id: milestoneId, project: { userId } } });
  if (!m) throw new AppError({ code: "NOT_FOUND", action: "Meilenstein", reason: "Meilenstein nicht gefunden." });
  return db.milestone.update({ where: { id: milestoneId }, data: { done } });
}
