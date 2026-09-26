import { z } from "zod";
import { deleteCalendarEvent, updateCalendarEvent } from "@/lib/calendar/service";
import { api, parseBody } from "@/lib/http/api";

const patch = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  start: z.coerce.date().optional(),
  end: z.coerce.date().optional(),
  location: z.string().max(500).nullish(),
  description: z.string().max(5000).nullish(),
  status: z.enum(["CONFIRMED", "TENTATIVE", "PROPOSED", "CANCELLED"]).optional(),
});

export const PATCH = api<{ id: string }>(async ({ req, user, params }) =>
  updateCalendarEvent(user.id, decodeURIComponent(params.id), await parseBody(req, patch), user.timezone),
);
export const DELETE = api<{ id: string }>(async ({ user, params }) => {
  await deleteCalendarEvent(user.id, decodeURIComponent(params.id), user.timezone);
  return { ok: true };
});
