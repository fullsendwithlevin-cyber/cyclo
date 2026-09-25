import { z } from "zod";
import { createCalendarEvent, eventDraftSchema, getAgenda, isGoogleCalendarConnected } from "@/lib/calendar/service";
import { AppError } from "@/lib/errors";
import { api, parseBody } from "@/lib/http/api";

export const GET = api(async ({ user, req }) => {
  const sp = req.nextUrl.searchParams;
  const from = new Date(sp.get("from") ?? Date.now());
  const to = new Date(sp.get("to") ?? Date.now() + 7 * 864e5);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from || to.getTime() - from.getTime() > 400 * 864e5)
    throw new AppError({ code: "VALIDATION", action: "Kalender laden", reason: "Ungültiger Zeitraum." });
  return getAgenda(user.id, { start: from, end: to }, user.timezone);
});

export const POST = api(async ({ req, user }) => {
  const body = await parseBody(req, eventDraftSchema.and(z.object({ target: z.enum(["local", "google"]).optional() })));
  const target = body.target ?? ((await isGoogleCalendarConnected(user.id)) ? "google" : "local");
  return createCalendarEvent(user.id, body, user.timezone, { target, source: "MANUAL" });
});
