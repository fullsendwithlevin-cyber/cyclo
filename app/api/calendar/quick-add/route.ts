import { z } from "zod";
import { createCalendarEvent, findConflicts, isGoogleCalendarConnected } from "@/lib/calendar/service";
import { AppError } from "@/lib/errors";
import { upsertExam, looksLikeExam } from "@/lib/exams/service";
import { api, parseBody } from "@/lib/http/api";
import { parseGermanDateTime } from "@/lib/time/parse-de";

/**
 * Schnelleingabe wie „Prüfung Elektrotechnik Freitag 10:00“ → Termin (und bei Prüfungen auch Prüfung).
 * `preview: true` liefert nur die Interpretation zur Bestätigung.
 */
export const POST = api(async ({ req, user }) => {
  const body = await parseBody(req, z.object({ text: z.string().trim().min(3).max(300), durationMinutes: z.number().int().min(5).max(1440).optional(), preview: z.boolean().optional(), target: z.enum(["local", "google"]).optional() }));
  const parsed = parseGermanDateTime(body.text, new Date(), user.timezone);
  if (!parsed)
    throw new AppError({ code: "VALIDATION", action: "Schnelleingabe", reason: "Keine Datums- oder Zeitangabe erkannt.", solution: "z. B. „Prüfung Freitag 10:00“ oder „morgen 19 Uhr Lernen“." });
  const title = parsed.rest || "Termin";
  const isExam = looksLikeExam(title);
  const minutes = body.durationMinutes ?? (isExam ? 90 : 60);
  const start = parsed.start;
  const end = parsed.hasTime ? new Date(start.getTime() + minutes * 60_000) : new Date(start.getTime() + 864e5);
  const { conflicts } = parsed.hasTime ? await findConflicts(user.id, { start, end }, user.timezone) : { conflicts: [] };
  const interpretation = { title, start: start.toISOString(), end: end.toISOString(), allDay: !parsed.hasTime, isExam, conflicts: conflicts.map((c) => c.title) };
  if (body.preview) return { interpretation };

  const target = body.target ?? ((await isGoogleCalendarConnected(user.id)) ? "google" : "local");
  let examId: string | null = null;
  if (isExam) {
    const subject = title.replace(/\b(prüfung|pruefung|klausur|test|exam|schularbeit)\b/gi, "").trim() || "Prüfung";
    examId = (await upsertExam(user.id, { subject, title, start, end: parsed.hasTime ? end : null, source: "MANUAL" })).exam.id;
  }
  const created = await createCalendarEvent(user.id, { title, start, end, allDay: !parsed.hasTime, kind: isExam ? "EXAM" : "EVENT" }, user.timezone, { target, source: "MANUAL", examId });
  return { interpretation, ...created, examId };
});
