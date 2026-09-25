import { db } from "@/lib/database/prisma";
import type { Job } from "@/lib/generated/prisma/client";
import { processDomainEvent } from "@/lib/automation/processor";
import { scanUser } from "@/lib/automation/scanner";
import { buildDailyBriefing, briefingToText } from "@/lib/briefing/daily";
import { processDocument } from "@/lib/documents/pipeline";
import { syncGmail } from "@/lib/integrations/google/sync";
import { syncOneNote } from "@/lib/integrations/microsoft/sync";
import { syncSchool } from "@/lib/integrations/school/sync";
import { extractMemoriesFromExchange } from "@/lib/memory/service";
import { notify } from "@/lib/notifications/service";
import { startChatRun } from "@/lib/agents/orchestrator";
import { dueReminders } from "@/lib/reminders/service";
import { formatDateTime } from "@/lib/time/zone";

type Handler = (payload: Record<string, unknown>, job: Job) => Promise<unknown>;

const str = (v: unknown) => (typeof v === "string" ? v : "");

export const JOB_HANDLERS: Record<string, Handler> = {
  "event.process": (p) => processDomainEvent(str(p.eventId)),
  "document.process": (p) => processDocument(str(p.documentId)),
  "sync.gmail": (p) => syncGmail(str(p.userId)),
  "sync.onenote": (p) => syncOneNote(str(p.userId)),
  "sync.school": (p) => syncSchool(str(p.userId)),
  "scan.user": (p) => scanUser(str(p.userId)),

  "memory.extract": async (p) => {
    const run = await db.agentRun.findUnique({ where: { id: str(p.runId) } });
    if (!run?.conversationId) return;
    const msgs = await db.message.findMany({ where: { conversationId: run.conversationId }, orderBy: { createdAt: "desc" }, take: 2 });
    const user = msgs.find((m) => m.role === "USER");
    const assistant = msgs.find((m) => m.role === "ASSISTANT");
    if (user && assistant) return extractMemoriesFromExchange(run.userId, user.content, assistant.content, run.id);
  },

  "agent.run": async (p) => {
    const userId = str(p.userId);
    const conversation = await db.conversation.create({ data: { userId, title: str(p.title) || "Automatischer Auftrag" } });
    return startChatRun({ userId, conversationId: conversation.id, message: str(p.goal), trigger: str(p.trigger) || "automation" });
  },

  "reminders.dispatch": async () => {
    const due = await dueReminders();
    for (const r of due) {
      const user = await db.user.findUniqueOrThrow({ where: { id: r.userId } });
      await notify(r.userId, { title: `Erinnerung: ${r.title}`, body: formatDateTime(r.remindAt, user.timezone), priority: "IMPORTANT", category: "reminder", link: r.taskId ? "/tasks" : "/calendar", dedupeKey: `reminder:${r.id}` });
      await db.reminder.update({ where: { id: r.id }, data: { sentAt: new Date() } });
    }
    return { sent: due.length };
  },

  "briefing.daily": async (p) => {
    const userId = str(p.userId);
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    const b = await buildDailyBriefing(userId);
    const critical = b.important.some((i) => i.level === "critical");
    return notify(userId, {
      title: "Dein Tagesüberblick",
      body: briefingToText(b, user.timezone).slice(0, 1800),
      priority: critical ? "IMPORTANT" : "NORMAL",
      category: "briefing",
      link: "/briefing",
      dedupeKey: `briefing:${str(p.day)}`,
    });
  },

  "maintenance.cleanup": async () => {
    const now = new Date();
    const [sessions, jobs] = await Promise.all([
      db.session.deleteMany({ where: { expiresAt: { lt: now } } }),
      db.job.deleteMany({ where: { status: { in: ["SUCCEEDED", "FAILED"] }, updatedAt: { lt: new Date(now.getTime() - 14 * 864e5) } } }),
    ]);
    await db.memory.deleteMany({ where: { expiresAt: { lt: now } } });
    return { sessions: sessions.count, jobs: jobs.count };
  },
};
