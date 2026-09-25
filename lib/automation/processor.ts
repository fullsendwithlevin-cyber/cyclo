import { db } from "@/lib/database/prisma";
import { isAIConfigured } from "@/lib/ai";
import { enqueue } from "@/lib/jobs/queue";
import { notify } from "@/lib/notifications/service";
import { formatDateTime } from "@/lib/time/zone";
import { getUserSettings } from "@/lib/users/settings";
import { automationByKey, ensureDefaultAutomations } from "./defaults";
import { priorityForScore, scoreEvent } from "./relevance";

/**
 * Event → Klassifikation/Relevanz → (über Schwelle) Benachrichtigung → Automationen (Agent-Run)
 * Der Agent-Run unterliegt denselben Berechtigungen wie ein Chat-Auftrag.
 */
export async function processDomainEvent(eventId: string) {
  const event = await db.domainEvent.findUnique({ where: { id: eventId }, include: { user: true } });
  if (!event || event.processedAt) return { skipped: true };
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  const settings = await getUserSettings(event.userId);
  const { score, reasons } = scoreEvent(event.type, payload);
  const tz = event.user.timezone;

  let notified = false;
  if (score >= settings.notificationThreshold) {
    const n = describe(event.type, payload, tz);
    if (n) {
      await notify(event.userId, { ...n, priority: priorityForScore(score), category: event.type.split(".")[0], dedupeKey: `event:${event.id}` });
      notified = true;
    }
  }

  const runs: string[] = [];
  await ensureDefaultAutomations(event.userId);
  const automations = await db.automation.findMany({ where: { userId: event.userId, trigger: event.type, enabled: true } });
  if (automations.length && isAIConfigured() && score >= 0.3) {
    for (const a of automations) {
      const def = automationByKey((a.config as { key?: string })?.key ?? "");
      if (!def) continue;
      await enqueue("agent.run", { userId: event.userId, goal: def.goal(payload), trigger: `automation:${def.key}`, title: a.name }, { userId: event.userId, dedupeKey: `automation:${a.id}:${event.id}` });
      await db.automation.update({ where: { id: a.id }, data: { lastRunAt: new Date() } });
      runs.push(def.key);
    }
  }

  await db.domainEvent.update({ where: { id: event.id }, data: { relevance: score, processedAt: new Date() } });
  return { score, reasons, notified, automations: runs };
}

function describe(type: string, p: Record<string, unknown>, tz: string): { title: string; body: string; link?: string } | null {
  const when = (v: unknown) => (typeof v === "string" ? formatDateTime(new Date(v), tz) : "");
  switch (type) {
    case "exam.detected":
      return { title: `Neue Prüfung: ${p.subject}`, body: `${p.title} – ${when(p.start)}`, link: `/exams/${p.examId}` };
    case "exam.changed":
      return { title: `Prüfung verschoben: ${p.subject}`, body: `Neu: ${when(p.start)} (vorher ${when(p.previousStart)})`, link: `/exams/${p.examId}` };
    case "email.important":
      return { title: "Wichtige E-Mail", body: `${String(p.subject ?? "")} – ${String(p.from ?? "")}${p.reason ? ` (${p.reason})` : ""}`, link: "/inbox" };
    case "deadline.approaching":
      return { title: `Deadline: ${p.title}`, body: `Fällig ${when(p.dueDate)}`, link: "/tasks" };
    case "task.overdue":
      return { title: `Überfällig: ${p.title}`, body: `War fällig ${when(p.dueDate)}`, link: "/tasks" };
    case "calendar.conflict":
      return { title: "Terminkonflikt", body: `${p.a} überschneidet sich mit ${p.b} (${when(p.start)})`, link: "/calendar" };
    case "document.new":
      return { title: "Neues Dokument", body: String(p.title ?? ""), link: `/documents/${p.documentId}` };
    case "school.entry":
      return { title: "Neuer Schuleintrag", body: String(p.title ?? ""), link: "/calendar" };
    default:
      return null;
  }
}
