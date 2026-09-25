import { z } from "zod";
import { db } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors";

export const reminderInputSchema = z.object({
  title: z.string().trim().min(1).max(300),
  remindAt: z.coerce.date(),
  taskId: z.string().nullish(),
  eventId: z.string().nullish(),
});

export async function createReminder(userId: string, raw: z.infer<typeof reminderInputSchema>) {
  const input = reminderInputSchema.parse(raw);
  if (input.taskId && !(await db.task.findFirst({ where: { id: input.taskId, userId } })))
    throw new AppError({ code: "NOT_FOUND", action: "Erinnerung erstellen", reason: "Aufgabe nicht gefunden." });
  if (input.eventId && !(await db.calendarEvent.findFirst({ where: { id: input.eventId, userId } })))
    throw new AppError({ code: "NOT_FOUND", action: "Erinnerung erstellen", reason: "Termin nicht gefunden." });
  return db.reminder.create({ data: { userId, title: input.title, remindAt: input.remindAt, taskId: input.taskId ?? null, eventId: input.eventId ?? null } });
}

export const listReminders = (userId: string) =>
  db.reminder.findMany({ where: { userId, sentAt: null }, orderBy: { remindAt: "asc" }, take: 100 });

export async function deleteReminder(userId: string, id: string) {
  const n = await db.reminder.deleteMany({ where: { id, userId } });
  if (!n.count) throw new AppError({ code: "NOT_FOUND", action: "Erinnerung löschen", reason: "Erinnerung nicht gefunden." });
}

/** Fällige, noch nicht gesendete Erinnerungen (für den Worker). */
export const dueReminders = (now = new Date(), limit = 100) =>
  db.reminder.findMany({ where: { sentAt: null, remindAt: { lte: now } }, take: limit, orderBy: { remindAt: "asc" } });
