import { z } from "zod";
import { db } from "@/lib/database/prisma";
import { AppError, toErrorInfo, type ErrorInfo } from "@/lib/errors";
import type { CalendarEvent } from "@/lib/generated/prisma/client";
import { GOOGLE_SCOPES, hasScopes } from "@/lib/integrations/catalog";
import { GoogleCalendarProvider } from "@/lib/integrations/google/calendar";
import { overlaps } from "./slots";
import type { CalendarEventDTO, EventDraft, Interval } from "./types";

export const eventDraftSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    start: z.coerce.date(),
    end: z.coerce.date(),
    allDay: z.boolean().optional(),
    location: z.string().max(500).nullish(),
    description: z.string().max(5000).nullish(),
    kind: z.enum(["EVENT", "STUDY_BLOCK", "EXAM", "WORK", "REMINDER"]).optional(),
  })
  .refine((d) => d.end > d.start, { message: "Ende muss nach dem Beginn liegen", path: ["end"] });

export async function isGoogleCalendarConnected(userId: string): Promise<boolean> {
  const i = await db.integration.findUnique({ where: { userId_provider: { userId, provider: "GOOGLE" } } });
  return Boolean(i && i.status === "CONNECTED" && hasScopes(i.scopes, GOOGLE_SCOPES.calendar));
}

export function localToDTO(e: CalendarEvent): CalendarEventDTO {
  return {
    id: e.id,
    title: e.title,
    start: e.start.toISOString(),
    end: e.end.toISOString(),
    allDay: e.allDay,
    location: e.location,
    description: e.description,
    source: e.source === "SCHOOL" ? "SCHOOL" : e.source === "AGENT" ? "AGENT" : e.source === "GOOGLE_CALENDAR" ? "GOOGLE_CALENDAR" : "MANUAL",
    externalId: e.externalId,
    calendarId: e.calendarId,
    kind: e.kind,
    status: e.status,
  };
}

export interface Agenda {
  events: CalendarEventDTO[];
  googleConnected: boolean;
  warnings: ErrorInfo[];
}

/** Vereint lokale Termine und (falls verbunden) Google-Termine – Fehler werden gemeldet, nicht versteckt. */
export async function getAgenda(userId: string, range: Interval, timezone: string): Promise<Agenda> {
  const googleConnected = await isGoogleCalendarConnected(userId);
  const warnings: ErrorInfo[] = [];
  let googleEvents: CalendarEventDTO[] = [];
  if (googleConnected) {
    try {
      googleEvents = await new GoogleCalendarProvider(userId, timezone).listEvents(range);
    } catch (err) {
      warnings.push(toErrorInfo(err, "Google-Termine laden"));
    }
  }
  const local = await db.calendarEvent.findMany({
    where: {
      userId,
      status: { not: "CANCELLED" },
      start: { lt: range.end },
      end: { gt: range.start },
      // Google-Spiegel nur anzeigen, wenn Google gerade nicht gelesen werden konnte
      ...(googleConnected && warnings.length === 0 ? { NOT: { source: "GOOGLE_CALENDAR" } } : {}),
    },
    orderBy: { start: "asc" },
  });
  const events = [...local.map(localToDTO), ...googleEvents].sort((a, b) => a.start.localeCompare(b.start));
  return { events, googleConnected, warnings };
}

export async function getBusyIntervals(userId: string, range: Interval, timezone: string) {
  const agenda = await getAgenda(userId, range, timezone);
  const busy = agenda.events
    .filter((e) => !e.allDay && e.status !== "CANCELLED" && e.status !== "PROPOSED")
    .map((e) => ({ id: e.id, start: new Date(e.start), end: new Date(e.end), title: e.title }));
  return { busy, warnings: agenda.warnings, googleConnected: agenda.googleConnected };
}

export async function findConflicts(userId: string, candidate: Interval, timezone: string, ignoreId?: string) {
  const { busy, warnings } = await getBusyIntervals(
    userId,
    { start: new Date(candidate.start.getTime() - 864e5), end: new Date(candidate.end.getTime() + 864e5) },
    timezone,
  );
  return { conflicts: busy.filter((b) => overlaps(b, candidate) && b.id !== ignoreId), warnings };
}

export type CalendarTarget = "local" | "google";

export interface CreateEventOptions {
  target: CalendarTarget;
  status?: "CONFIRMED" | "TENTATIVE" | "PROPOSED";
  source?: "MANUAL" | "AGENT";
  examId?: string | null;
  projectId?: string | null;
}

/** Legt einen Termin an und verifiziert ihn durch erneutes Lesen. */
export async function createCalendarEvent(userId: string, draft: EventDraft, timezone: string, opts: CreateEventOptions) {
  eventDraftSchema.parse(draft);
  if (opts.target === "google") {
    const provider = new GoogleCalendarProvider(userId, timezone);
    const created = await provider.createEvent(draft);
    const verified = await provider.getEvent(created.externalId!, created.calendarId ?? "primary");
    await db.calendarEvent.upsert({
      where: { userId_source_externalId: { userId, source: "GOOGLE_CALENDAR", externalId: created.externalId! } },
      create: {
        userId,
        title: draft.title,
        start: draft.start,
        end: draft.end,
        allDay: draft.allDay ?? false,
        location: draft.location ?? null,
        description: draft.description ?? null,
        kind: draft.kind ?? "EVENT",
        source: "GOOGLE_CALENDAR",
        externalId: created.externalId,
        calendarId: created.calendarId,
        examId: opts.examId ?? null,
        projectId: opts.projectId ?? null,
      },
      update: {},
    });
    return { event: verified, verified: verified.title === draft.title };
  }
  const row = await db.calendarEvent.create({
    data: {
      userId,
      title: draft.title,
      start: draft.start,
      end: draft.end,
      allDay: draft.allDay ?? false,
      location: draft.location ?? null,
      description: draft.description ?? null,
      kind: draft.kind ?? "EVENT",
      status: opts.status ?? "CONFIRMED",
      source: opts.source ?? "MANUAL",
      examId: opts.examId ?? null,
      projectId: opts.projectId ?? null,
    },
  });
  const verified = await db.calendarEvent.findUnique({ where: { id: row.id } });
  return { event: localToDTO(verified!), verified: Boolean(verified) };
}

function parseId(id: string): { kind: "google"; calendarId: string; eventId: string } | { kind: "local"; id: string } {
  if (id.startsWith("google:")) {
    const [, calendarId, ...rest] = id.split(":");
    return { kind: "google", calendarId: calendarId ?? "primary", eventId: rest.join(":") };
  }
  return { kind: "local", id };
}

export async function updateCalendarEvent(userId: string, id: string, patch: Partial<EventDraft> & { status?: "CONFIRMED" | "TENTATIVE" | "PROPOSED" | "CANCELLED" }, timezone: string) {
  const ref = parseId(id);
  if (ref.kind === "google") {
    const provider = new GoogleCalendarProvider(userId, timezone);
    await provider.updateEvent(ref.eventId, patch, ref.calendarId);
    const verified = await provider.getEvent(ref.eventId, ref.calendarId);
    await db.calendarEvent.updateMany({
      where: { userId, source: "GOOGLE_CALENDAR", externalId: ref.eventId },
      data: { title: patch.title, start: patch.start, end: patch.end, location: patch.location, description: patch.description },
    });
    return { event: verified, verified: true };
  }
  const existing = await db.calendarEvent.findFirst({ where: { id: ref.id, userId } });
  if (!existing) throw new AppError({ code: "NOT_FOUND", action: "Termin ändern", reason: "Termin nicht gefunden." });
  const updated = await db.calendarEvent.update({
    where: { id: ref.id },
    data: { title: patch.title, start: patch.start, end: patch.end, allDay: patch.allDay, location: patch.location, description: patch.description, kind: patch.kind, status: patch.status },
  });
  return { event: localToDTO(updated), verified: true };
}

export async function deleteCalendarEvent(userId: string, id: string, timezone: string) {
  const ref = parseId(id);
  if (ref.kind === "google") {
    await new GoogleCalendarProvider(userId, timezone).deleteEvent(ref.eventId, ref.calendarId);
    await db.calendarEvent.deleteMany({ where: { userId, source: "GOOGLE_CALENDAR", externalId: ref.eventId } });
    return;
  }
  const n = await db.calendarEvent.deleteMany({ where: { id: ref.id, userId } });
  if (!n.count) throw new AppError({ code: "NOT_FOUND", action: "Termin löschen", reason: "Termin nicht gefunden." });
}

/** Bestätigt einen vorgeschlagenen (PROPOSED) lokalen Termin und überträgt ihn optional nach Google. */
export async function confirmProposedEvent(userId: string, id: string, timezone: string, target: CalendarTarget) {
  const e = await db.calendarEvent.findFirst({ where: { id, userId, status: "PROPOSED" } });
  if (!e) throw new AppError({ code: "NOT_FOUND", action: "Termin bestätigen", reason: "Vorgeschlagener Termin nicht gefunden." });
  if (target === "google") {
    const res = await createCalendarEvent(
      userId,
      { title: e.title, start: e.start, end: e.end, allDay: e.allDay, location: e.location, description: e.description, kind: e.kind },
      timezone,
      { target: "google", examId: e.examId, projectId: e.projectId },
    );
    await db.calendarEvent.delete({ where: { id } });
    return res;
  }
  const updated = await db.calendarEvent.update({ where: { id }, data: { status: "CONFIRMED" } });
  return { event: localToDTO(updated), verified: true };
}
