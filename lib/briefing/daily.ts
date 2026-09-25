import { db } from "@/lib/database/prisma";
import { getAgenda } from "@/lib/calendar/service";
import { findFreeSlots, overlaps } from "@/lib/calendar/slots";
import type { CalendarEventDTO } from "@/lib/calendar/types";
import type { ErrorInfo } from "@/lib/errors";
import { listTasks, OPEN_STATUSES } from "@/lib/tasks/service";
import { addLocalDays, formatTime, startOfLocalDay } from "@/lib/time/zone";
import { getUserSettings } from "@/lib/users/settings";

export interface DailyBriefing {
  date: string;
  events: CalendarEventDTO[];
  important: { text: string; link?: string; level: "critical" | "important" | "info" }[];
  tasks: { id: string; title: string; priority: string; dueDate: string | null }[];
  deadlines: { id: string; title: string; dueDate: string }[];
  recommendations: string[];
  pendingConfirmations: number;
  warnings: ErrorInfo[];
}

/**
 * Deterministische Tagesübersicht aus echten Daten (Kalender, Aufgaben, Prüfungen, Hinweise).
 * Keine erfundenen Inhalte: fehlt eine Quelle, erscheint eine Warnung.
 */
export async function buildDailyBriefing(userId: string, now = new Date()): Promise<DailyBriefing> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const tz = user.timezone;
  const settings = await getUserSettings(userId);
  const dayStart = startOfLocalDay(now, tz);
  const dayEnd = addLocalDays(dayStart, 1, tz);

  const [agenda, tasks, exams, pendingConfirmations, notifications] = await Promise.all([
    getAgenda(userId, { start: dayStart, end: dayEnd }, tz),
    listTasks(userId, { status: OPEN_STATUSES, limit: 50 }),
    db.exam.findMany({ where: { userId, start: { gte: now, lte: new Date(now.getTime() + 21 * 864e5) } }, orderBy: { start: "asc" }, include: { events: { where: { kind: "STUDY_BLOCK" } } } }),
    db.toolCall.count({ where: { userId, status: "AWAITING_CONFIRMATION" } }),
    db.notification.findMany({ where: { userId, readAt: null, priority: { in: ["CRITICAL", "IMPORTANT"] } }, orderBy: { createdAt: "desc" }, take: 5 }),
  ]);

  const important: DailyBriefing["important"] = [];
  for (const e of exams) {
    const days = Math.ceil((startOfLocalDay(e.start, tz).getTime() - dayStart.getTime()) / 864e5);
    important.push({
      text: `${e.subject}: ${e.title} ${days <= 0 ? "heute" : days === 1 ? "morgen" : `in ${days} Tagen`}${e.events.length ? ` · ${e.events.length} Lernblöcke geplant` : " · noch kein Lernplan"}`,
      link: `/exams/${e.id}`,
      level: days <= 3 ? "critical" : "important",
    });
  }
  const timed = agenda.events.filter((e) => !e.allDay);
  for (let i = 0; i < timed.length; i++)
    for (let j = i + 1; j < timed.length; j++)
      if (overlaps({ start: new Date(timed[i].start), end: new Date(timed[i].end) }, { start: new Date(timed[j].start), end: new Date(timed[j].end) }))
        important.push({ text: `Konflikt: „${timed[i].title}“ und „${timed[j].title}“`, link: "/calendar", level: "important" });
  for (const n of notifications) important.push({ text: `${n.title} – ${n.body}`, link: n.link ?? undefined, level: n.priority === "CRITICAL" ? "critical" : "important" });

  const deadlines = tasks
    .filter((t) => t.dueDate && t.dueDate.getTime() <= dayEnd.getTime() + 864e5)
    .map((t) => ({ id: t.id, title: t.title, dueDate: t.dueDate!.toISOString() }));

  const recommendations: string[] = [];
  const nextExam = exams[0];
  if (nextExam) {
    const busy = agenda.events.filter((e) => !e.allDay).map((e) => ({ start: new Date(e.start), end: new Date(e.end) }));
    const [slot] = findFreeSlots({
      range: { start: now > dayStart ? now : dayStart, end: dayEnd },
      busy,
      window: { start: settings.study.windowStart, end: settings.study.windowEnd },
      durationMinutes: settings.study.blockMinutes,
      timezone: tz,
      maxSlots: 1,
    });
    if (slot) recommendations.push(`${settings.study.blockMinutes} min Lernen für ${nextExam.subject} um ${formatTime(slot.start, tz)}.`);
    else recommendations.push(`Heute ist im Lernfenster kein freier Block für ${nextExam.subject} – ggf. morgen einplanen.`);
  }
  if (pendingConfirmations) recommendations.push(`${pendingConfirmations} vorbereitete Aktion(en) warten auf deine Bestätigung.`);
  const overdue = tasks.filter((t) => t.dueDate && t.dueDate < now);
  if (overdue.length) recommendations.push(`${overdue.length} überfällige Aufgabe(n) neu terminieren oder abschließen.`);

  return {
    date: dayStart.toISOString(),
    events: agenda.events,
    important,
    tasks: tasks.slice(0, 7).map((t) => ({ id: t.id, title: t.title, priority: t.priority, dueDate: t.dueDate?.toISOString() ?? null })),
    deadlines,
    recommendations,
    pendingConfirmations,
    warnings: agenda.warnings,
  };
}

export function briefingToText(b: DailyBriefing, tz: string): string {
  const lines: string[] = ["HEUTE"];
  if (!b.events.length) lines.push("Keine Termine.");
  for (const e of b.events) lines.push(`${e.allDay ? "ganztägig" : formatTime(new Date(e.start), tz)} – ${e.title}`);
  if (b.important.length) lines.push("", "WICHTIG", ...b.important.map((i) => i.text));
  if (b.tasks.length) lines.push("", "AUFGABEN", ...b.tasks.map((t) => `□ ${t.title}`));
  if (b.deadlines.length) lines.push("", "DEADLINES", ...b.deadlines.map((d) => `${d.title} (${formatTime(new Date(d.dueDate), tz)})`));
  if (b.recommendations.length) lines.push("", "EMPFEHLUNG", ...b.recommendations);
  return lines.join("\n");
}
