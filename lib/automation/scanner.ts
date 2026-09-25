import { db } from "@/lib/database/prisma";
import { getAgenda } from "@/lib/calendar/service";
import { overlaps } from "@/lib/calendar/slots";
import { localDateKey } from "@/lib/time/zone";
import { emitDomainEvent } from "./events";

/** Periodischer Scan: Deadlines, überfällige Aufgaben, Terminkonflikte. */
export async function scanUser(userId: string, now = new Date()) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const day = localDateKey(now, user.timezone);
  let emitted = 0;

  const tasks = await db.task.findMany({
    where: { userId, status: { in: ["INBOX", "PLANNED", "IN_PROGRESS", "WAITING"] }, dueDate: { not: null, lte: new Date(now.getTime() + 48 * 3600e3) } },
  });
  for (const t of tasks) {
    const overdue = t.dueDate! < now;
    const type = overdue ? "task.overdue" : "deadline.approaching";
    const ev = await emitDomainEvent(userId, type, { taskId: t.id, title: t.title, dueDate: t.dueDate!.toISOString(), priority: t.priority }, `${type}:${t.id}:${day}`);
    if (ev) emitted++;
  }

  const agenda = await getAgenda(userId, { start: now, end: new Date(now.getTime() + 7 * 864e5) }, user.timezone);
  const timed = agenda.events.filter((e) => !e.allDay && e.status !== "PROPOSED" && e.status !== "CANCELLED");
  for (let i = 0; i < timed.length; i++)
    for (let j = i + 1; j < timed.length; j++) {
      const a = timed[i];
      const b = timed[j];
      if (!overlaps({ start: new Date(a.start), end: new Date(a.end) }, { start: new Date(b.start), end: new Date(b.end) })) continue;
      const key = [a.id, b.id].sort().join("|");
      const ev = await emitDomainEvent(userId, "calendar.conflict", { a: a.title, b: b.title, start: a.start > b.start ? a.start : b.start, ids: [a.id, b.id] }, `calendar.conflict:${key}`);
      if (ev) emitted++;
    }
  return { emitted, warnings: agenda.warnings };
}
