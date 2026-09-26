import { db } from "@/lib/database/prisma";
import { isAIConfigured } from "@/lib/ai";
import { getAgenda } from "@/lib/calendar/service";
import { api } from "@/lib/http/api";
import { listProjects } from "@/lib/projects/service";
import { listTasks, OPEN_STATUSES } from "@/lib/tasks/service";
import { getCapabilityStatus } from "@/lib/tools/registry";
import { addLocalDays, startOfLocalDay } from "@/lib/time/zone";

export const GET = api(async ({ user }) => {
  const now = new Date();
  const dayStart = startOfLocalDay(now, user.timezone);
  const dayEnd = addLocalDays(dayStart, 1, user.timezone);
  const [agenda, tasks, exams, projects, documents, notifications, emails, runs, pending, capabilities] = await Promise.all([
    getAgenda(user.id, { start: dayStart, end: dayEnd }, user.timezone),
    listTasks(user.id, { status: OPEN_STATUSES, limit: 50 }),
    db.exam.findMany({ where: { userId: user.id, start: { gte: now } }, orderBy: { start: "asc" }, take: 5, include: { events: { where: { kind: "STUDY_BLOCK" }, select: { start: true, end: true, status: true } } } }),
    listProjects(user.id),
    db.document.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, title: true, source: true, status: true, createdAt: true } }),
    db.notification.findMany({ where: { userId: user.id, readAt: null }, orderBy: { createdAt: "desc" }, take: 8 }),
    db.sourceItem.findMany({ where: { userId: user.id, source: "GMAIL", relevance: { gte: 0.5 }, occurredAt: { gte: new Date(now.getTime() - 7 * 864e5) } }, orderBy: { occurredAt: "desc" }, take: 5 }),
    db.agentRun.findMany({
      where: { userId: user.id },
      orderBy: { startedAt: "desc" },
      take: 5,
      select: { id: true, goal: true, status: true, trigger: true, startedAt: true, conversationId: true, steps: { orderBy: { index: "asc" }, select: { title: true, status: true } }, toolCalls: { orderBy: { createdAt: "asc" }, select: { toolName: true, status: true } } },
    }),
    db.toolCall.findMany({ where: { userId: user.id, status: "AWAITING_CONFIRMATION" }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, toolName: true, createdAt: true, run: { select: { conversationId: true, goal: true } } } }),
    getCapabilityStatus(user.id),
  ]);
  return {
    today: agenda,
    tasks: tasks.slice(0, 8),
    taskCounts: { open: tasks.length, overdue: tasks.filter((t) => t.dueDate && t.dueDate < now).length },
    exams: exams.map((e) => ({
      ...e,
      study: { total: e.events.length, done: e.events.filter((s) => s.end < now).length },
    })),
    projects: projects.filter((p) => p.status === "ACTIVE").slice(0, 6),
    documents,
    inbox: { notifications, emails },
    activity: runs,
    pending,
    setup: { aiConfigured: isAIConfigured(), capabilities },
  };
});
