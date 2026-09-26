import { z } from "zod";
import { db } from "@/lib/database/prisma";
import { TaskPriority, TaskStatus } from "@/lib/generated/prisma/enums";
import { completeTask, createTask, deleteTask, listTasks, OPEN_STATUSES, updateTask } from "@/lib/tasks/service";
import { createProject, getProject, listProjects, updateProject } from "@/lib/projects/service";
import { createReminder, listReminders } from "@/lib/reminders/service";
import { notify } from "@/lib/notifications/service";
import { createNote } from "@/lib/notes/service";
import { formatDateTime } from "@/lib/time/zone";
import { defineTool } from "./types";
import { iso, isoDateTime, isoDateTimeOptional } from "./common";

const taskOut = (t: { id: string; title: string; status: string; priority: string; dueDate: Date | null; projectId: string | null; estimatedMinutes: number | null }) => ({
  id: t.id,
  title: t.title,
  status: t.status,
  priority: t.priority,
  dueDate: iso(t.dueDate),
  projectId: t.projectId,
  estimatedMinutes: t.estimatedMinutes,
});

export const taskTools = [
  defineTool({
    name: "tasks.list",
    title: "Aufgaben laden",
    description: "Listet Aufgaben, standardmäßig alle offenen, sortiert nach Wichtigkeit (Priorität + Deadline).",
    inputSchema: z.object({
      status: z.array(z.enum(TaskStatus)).optional().describe("Standard: alle offenen Status"),
      projectId: z.string().optional(),
      dueBefore: isoDateTimeOptional,
      search: z.string().optional(),
      limit: z.number().int().min(1).max(100).optional(),
    }),
    permission: "READ",
    scope: "internal",
    async execute(input, ctx) {
      const tasks = await listTasks(ctx.userId, { ...input, status: input.status ?? OPEN_STATUSES, limit: input.limit ?? 30 });
      return {
        data: tasks.map((t) => ({ ...taskOut(t), project: t.project?.name ?? null, blockedBy: t.dependsOn.filter((d) => d.status !== "DONE").map((d) => d.title) })),
        summary: `${tasks.length} Aufgaben gefunden`,
        sources: tasks.slice(0, 5).map((t) => ({ kind: "task", id: t.id, title: t.title, url: "/tasks" })),
      };
    },
  }),
  defineTool({
    name: "tasks.create",
    title: "Aufgabe erstellen",
    description: "Erstellt eine Aufgabe in der App.",
    inputSchema: z.object({
      title: z.string().min(1).max(300),
      description: z.string().max(5000).optional(),
      priority: z.enum(TaskPriority).optional(),
      dueDate: isoDateTimeOptional,
      estimatedMinutes: z.number().int().min(1).max(10000).optional(),
      projectId: z.string().optional(),
      examId: z.string().optional(),
      dependsOnIds: z.array(z.string()).optional(),
    }),
    permission: "WRITE",
    scope: "internal",
    describe: (i) => `Aufgabe „${i.title}“ erstellen`,
    async execute(input, ctx) {
      const task = await createTask(ctx.userId, { ...input, source: "AGENT" });
      const verified = Boolean(await db.task.findUnique({ where: { id: task.id } }));
      return { data: taskOut(task), summary: `Aufgabe „${task.title}“ erstellt`, verified, sources: [{ kind: "task", id: task.id, title: task.title, url: "/tasks" }] };
    },
  }),
  defineTool({
    name: "tasks.update",
    title: "Aufgabe ändern",
    description: "Ändert Titel, Status, Priorität, Deadline, Projekt oder Abhängigkeiten einer Aufgabe.",
    inputSchema: z.object({
      id: z.string(),
      title: z.string().min(1).max(300).optional(),
      description: z.string().max(5000).optional(),
      status: z.enum(TaskStatus).optional(),
      priority: z.enum(TaskPriority).optional(),
      dueDate: isoDateTime.nullable().optional(),
      estimatedMinutes: z.number().int().min(1).max(10000).optional(),
      projectId: z.string().nullable().optional(),
      dependsOnIds: z.array(z.string()).optional(),
    }),
    permission: "WRITE",
    scope: "internal",
    describe: (i) => `Aufgabe ${i.id} ändern`,
    async execute({ id, ...patch }, ctx) {
      const task = await updateTask(ctx.userId, id, patch);
      return { data: taskOut(task), summary: `Aufgabe „${task.title}“ aktualisiert`, verified: true };
    },
  }),
  defineTool({
    name: "tasks.complete",
    title: "Aufgabe abschließen",
    description: "Markiert eine Aufgabe als erledigt.",
    inputSchema: z.object({ id: z.string() }),
    permission: "WRITE",
    scope: "internal",
    async execute({ id }, ctx) {
      const task = await completeTask(ctx.userId, id);
      return { data: taskOut(task), summary: `„${task.title}“ erledigt`, verified: task.status === "DONE" };
    },
  }),
  defineTool({
    name: "tasks.delete",
    title: "Aufgabe löschen",
    description: "Löscht eine Aufgabe dauerhaft. Bevorzugt stattdessen Status CANCELLED.",
    inputSchema: z.object({ id: z.string() }),
    permission: "DELETE",
    scope: "internal",
    describe: (i) => `Aufgabe ${i.id} dauerhaft löschen`,
    async execute({ id }, ctx) {
      await deleteTask(ctx.userId, id);
      const gone = !(await db.task.findUnique({ where: { id } }));
      return { data: { id, deleted: gone }, summary: "Aufgabe gelöscht", verified: gone };
    },
  }),
];

export const projectTools = [
  defineTool({
    name: "projects.list",
    title: "Projekte laden",
    description: "Listet aktive Projekte mit Fortschritt.",
    inputSchema: z.object({ includeArchived: z.boolean().optional() }),
    permission: "READ",
    scope: "internal",
    async execute(input, ctx) {
      const projects = await listProjects(ctx.userId, input.includeArchived);
      return {
        data: projects.map((p) => ({ id: p.id, name: p.name, status: p.status, dueDate: iso(p.dueDate), progress: p.progress, counts: p._count })),
        summary: `${projects.length} Projekte`,
      };
    },
  }),
  defineTool({
    name: "projects.get",
    title: "Projekt laden",
    description: "Lädt ein Projekt mit Aufgaben, Meilensteinen, Terminen, Dokumenten und Notizen.",
    inputSchema: z.object({ id: z.string() }),
    permission: "READ",
    scope: "internal",
    async execute({ id }, ctx) {
      const p = await getProject(ctx.userId, id);
      return {
        data: {
          id: p.id,
          name: p.name,
          description: p.description,
          status: p.status,
          dueDate: iso(p.dueDate),
          tasks: p.tasks.map(taskOut),
          milestones: p.milestones.map((m) => ({ title: m.title, dueDate: iso(m.dueDate), done: m.done })),
          events: p.events.map((e) => ({ id: e.id, title: e.title, start: iso(e.start) })),
          documents: p.documents.map((d) => ({ id: d.id, title: d.title })),
          notes: p.notes.map((n) => ({ id: n.id, title: n.title })),
        },
        summary: `Projekt „${p.name}“ geladen`,
        sources: [{ kind: "project", id: p.id, title: p.name, url: `/projects/${p.id}` }],
      };
    },
  }),
  defineTool({
    name: "projects.create",
    title: "Projekt erstellen",
    description: "Erstellt ein Projekt, das Aufgaben, Dokumente, Termine und Notizen bündelt.",
    inputSchema: z.object({ name: z.string().min(1).max(200), description: z.string().max(5000).optional(), dueDate: isoDateTimeOptional }),
    permission: "WRITE",
    scope: "internal",
    describe: (i) => `Projekt „${i.name}“ erstellen`,
    async execute(input, ctx) {
      const p = await createProject(ctx.userId, input);
      return { data: { id: p.id, name: p.name }, summary: `Projekt „${p.name}“ erstellt`, verified: true, sources: [{ kind: "project", id: p.id, title: p.name, url: `/projects/${p.id}` }] };
    },
  }),
  defineTool({
    name: "projects.update",
    title: "Projekt ändern",
    description: "Ändert Name, Beschreibung, Status oder Deadline eines Projekts.",
    inputSchema: z.object({
      id: z.string(),
      name: z.string().min(1).max(200).optional(),
      description: z.string().max(5000).optional(),
      status: z.enum(["ACTIVE", "PAUSED", "DONE", "ARCHIVED"]).optional(),
      dueDate: isoDateTime.nullable().optional(),
    }),
    permission: "WRITE",
    scope: "internal",
    async execute({ id, ...patch }, ctx) {
      const p = await updateProject(ctx.userId, id, patch);
      return { data: { id: p.id, name: p.name, status: p.status }, summary: `Projekt „${p.name}“ aktualisiert`, verified: true };
    },
  }),
  defineTool({
    name: "notes.create",
    title: "Notiz speichern",
    description: "Speichert eine Notiz in der App (optional in einem Projekt), z. B. eine erstellte Lernübersicht.",
    inputSchema: z.object({ title: z.string().min(1).max(300), content: z.string().max(100000), projectId: z.string().optional() }),
    permission: "WRITE",
    scope: "internal",
    describe: (i) => `Notiz „${i.title}“ speichern`,
    async execute(input, ctx) {
      const n = await createNote(ctx.userId, input);
      return { data: { id: n.id, title: n.title }, summary: `Notiz „${n.title}“ gespeichert`, verified: true };
    },
  }),
];

export const reminderTools = [
  defineTool({
    name: "reminders.create",
    title: "Erinnerung erstellen",
    description: "Erstellt eine Erinnerung zu einem Zeitpunkt (optional zu Aufgabe/Termin).",
    inputSchema: z.object({ title: z.string().min(1).max(300), remindAt: isoDateTime, taskId: z.string().optional(), eventId: z.string().optional() }),
    permission: "WRITE",
    scope: "internal",
    describe: (i) => `Erinnerung „${i.title}“`,
    async execute(input, ctx) {
      const r = await createReminder(ctx.userId, input);
      return { data: { id: r.id, title: r.title, remindAt: iso(r.remindAt) }, summary: `Erinnerung für ${formatDateTime(r.remindAt, ctx.timezone)} gesetzt`, verified: true };
    },
  }),
  defineTool({
    name: "reminders.list",
    title: "Erinnerungen laden",
    description: "Listet offene Erinnerungen.",
    inputSchema: z.object({}),
    permission: "READ",
    scope: "internal",
    async execute(_i, ctx) {
      const list = await listReminders(ctx.userId);
      return { data: list.map((r) => ({ id: r.id, title: r.title, remindAt: iso(r.remindAt) })), summary: `${list.length} Erinnerungen` };
    },
  }),
  defineTool({
    name: "notifications.create",
    title: "Benachrichtigung erstellen",
    description: "Erstellt eine In-App-Benachrichtigung (bei CRITICAL/IMPORTANT ggf. Push/E-Mail laut Einstellungen).",
    inputSchema: z.object({
      title: z.string().min(1).max(200),
      body: z.string().min(1).max(2000),
      priority: z.enum(["CRITICAL", "IMPORTANT", "NORMAL", "LOW"]).optional(),
      link: z.string().regex(/^\/[^/\\]/).optional().describe("Relativer App-Pfad"),
    }),
    permission: "WRITE",
    scope: "internal",
    async execute(input, ctx) {
      const n = await notify(ctx.userId, { ...input, category: "agent", dedupeKey: `agent:${ctx.runId}:${input.title}` });
      return { data: { id: n?.id ?? null }, summary: "Benachrichtigung erstellt", verified: Boolean(n) };
    },
  }),
];
