import { z } from "zod";
import { AppError } from "@/lib/errors";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  findConflicts,
  getAgenda,
  getBusyIntervals,
  isGoogleCalendarConnected,
  updateCalendarEvent,
} from "@/lib/calendar/service";
import { findFreeSlots } from "@/lib/calendar/slots";
import { getExam, listUpcomingExams, updateExam, upsertExam } from "@/lib/exams/service";
import { planStudySessions } from "@/lib/exams/study-plan";
import { getUserSettings } from "@/lib/users/settings";
import { formatDateTime } from "@/lib/time/zone";
import { defineTool } from "./types";
import { dayMs, iso, isoDateTime, isoDateTimeOptional } from "./common";

const target = z.enum(["local", "google"]).optional().describe("google = Google Calendar (falls verbunden), local = nur in der App");

async function resolveTarget(userId: string, t?: "local" | "google") {
  if (t) return t;
  return (await isGoogleCalendarConnected(userId)) ? "google" : "local";
}

const eventKind = z.enum(["EVENT", "STUDY_BLOCK", "EXAM", "WORK", "REMINDER"]).optional();

export const calendarTools = [
  defineTool({
    name: "calendar.listEvents",
    title: "Kalender prüfen",
    description: "Listet Termine im Zeitraum (App + Google Calendar, falls verbunden). Warnungen zeigen nicht erreichbare Quellen.",
    inputSchema: z.object({ from: isoDateTime, to: isoDateTime }),
    permission: "READ",
    scope: "internal",
    capability: "google-calendar",
    async execute({ from, to }, ctx) {
      if (to.getTime() - from.getTime() > 120 * dayMs)
        throw new AppError({ code: "VALIDATION", action: "Kalender laden", reason: "Zeitraum maximal 120 Tage." });
      const agenda = await getAgenda(ctx.userId, { start: from, end: to }, ctx.timezone);
      return {
        data: {
          googleConnected: agenda.googleConnected,
          warnings: agenda.warnings,
          events: agenda.events.map((e) => ({ id: e.id, title: e.title, start: e.start, end: e.end, allDay: e.allDay, location: e.location, kind: e.kind, status: e.status, source: e.source })),
        },
        summary: `${agenda.events.length} Termine${agenda.googleConnected ? "" : " (Google Calendar nicht verbunden)"}`,
        sources: agenda.events.slice(0, 6).map((e) => ({ kind: "calendar", id: e.id, title: `${e.title} · ${formatDateTime(new Date(e.start), ctx.timezone)}`, url: e.htmlLink ?? "/calendar" })),
      };
    },
  }),
  defineTool({
    name: "calendar.findFreeSlots",
    title: "Freie Zeiten suchen",
    description: "Findet freie Zeitfenster einer bestimmten Dauer in einem Tagesfenster (Standard: Lernzeitfenster aus den Einstellungen).",
    inputSchema: z.object({
      from: isoDateTime,
      to: isoDateTime,
      durationMinutes: z.number().int().min(10).max(600),
      windowStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      windowEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      maxSlots: z.number().int().min(1).max(50).optional(),
    }),
    permission: "READ",
    scope: "internal",
    async execute(i, ctx) {
      const settings = await getUserSettings(ctx.userId);
      const { busy, warnings } = await getBusyIntervals(ctx.userId, { start: i.from, end: i.to }, ctx.timezone);
      const slots = findFreeSlots({
        range: { start: i.from, end: i.to },
        busy,
        window: { start: i.windowStart ?? settings.study.windowStart, end: i.windowEnd ?? settings.study.windowEnd },
        durationMinutes: i.durationMinutes,
        timezone: ctx.timezone,
        maxSlots: i.maxSlots ?? 10,
      });
      return { data: { slots: slots.map((s) => ({ start: iso(s.start), end: iso(s.end) })), warnings }, summary: `${slots.length} freie Zeitfenster` };
    },
  }),
  defineTool({
    name: "calendar.checkConflicts",
    title: "Konflikte prüfen",
    description: "Prüft, ob ein Zeitraum mit bestehenden Terminen kollidiert.",
    inputSchema: z.object({ start: isoDateTime, end: isoDateTime }),
    permission: "READ",
    scope: "internal",
    async execute({ start, end }, ctx) {
      const { conflicts, warnings } = await findConflicts(ctx.userId, { start, end }, ctx.timezone);
      return {
        data: { conflicts: conflicts.map((c) => ({ title: c.title, start: iso(c.start), end: iso(c.end) })), warnings },
        summary: conflicts.length ? `${conflicts.length} Konflikt(e)` : "Keine Konflikte",
      };
    },
  }),
  defineTool({
    name: "calendar.createEvent",
    title: "Kalendertermin erstellen",
    description: "Erstellt einen Termin und verifiziert ihn. Ohne target: Google Calendar, falls verbunden, sonst App-Kalender.",
    inputSchema: z.object({
      title: z.string().min(1).max(300),
      start: isoDateTime,
      end: isoDateTime,
      allDay: z.boolean().optional(),
      location: z.string().max(500).optional(),
      description: z.string().max(5000).optional(),
      kind: eventKind,
      target,
      examId: z.string().optional(),
      projectId: z.string().optional(),
    }),
    permission: "WRITE",
    scope: (i) => (i.target === "local" ? "internal" : "external"),
    capability: "google-calendar",
    describe: (i) => `Termin „${i.title}“ am ${i.start.toISOString().slice(0, 16).replace("T", " ")} UTC ${i.target === "local" ? "im App-Kalender" : "im Kalender"} erstellen`,
    async execute(i, ctx) {
      const t = await resolveTarget(ctx.userId, i.target);
      const { conflicts } = await findConflicts(ctx.userId, { start: i.start, end: i.end }, ctx.timezone);
      const res = await createCalendarEvent(ctx.userId, i, ctx.timezone, { target: t, source: "AGENT", examId: i.examId, projectId: i.projectId });
      return {
        data: { event: res.event, target: t, conflicts: conflicts.map((c) => c.title) },
        summary: `Termin „${i.title}“ (${formatDateTime(i.start, ctx.timezone)}) in ${t === "google" ? "Google Calendar" : "App-Kalender"} erstellt${conflicts.length ? ` – Konflikt mit ${conflicts.map((c) => c.title).join(", ")}` : ""}`,
        verified: res.verified,
        sources: [{ kind: "calendar", id: res.event.id, title: res.event.title, url: res.event.htmlLink ?? "/calendar" }],
      };
    },
  }),
  defineTool({
    name: "calendar.createEvents",
    title: "Mehrere Termine erstellen",
    description: "Erstellt mehrere Termine auf einmal (z. B. Lernplan) – eine einzige Bestätigung für alle.",
    inputSchema: z.object({
      events: z
        .array(z.object({ title: z.string().min(1).max(300), start: isoDateTime, end: isoDateTime, description: z.string().max(2000).optional(), kind: eventKind }))
        .min(1)
        .max(40),
      target,
      examId: z.string().optional(),
      projectId: z.string().optional(),
    }),
    permission: "WRITE",
    scope: (i) => (i.target === "local" ? "internal" : "external"),
    capability: "google-calendar",
    describe: (i) => `${i.events.length} Termine erstellen (${i.events.map((e) => e.title).slice(0, 3).join(", ")}${i.events.length > 3 ? " …" : ""})`,
    async execute(i, ctx) {
      const t = await resolveTarget(ctx.userId, i.target);
      const created = [];
      const failed: { title: string; reason: string }[] = [];
      for (const e of i.events) {
        try {
          const res = await createCalendarEvent(ctx.userId, e, ctx.timezone, { target: t, source: "AGENT", examId: i.examId, projectId: i.projectId });
          created.push({ id: res.event.id, title: e.title, start: iso(e.start), verified: res.verified });
        } catch (err) {
          failed.push({ title: e.title, reason: err instanceof Error ? err.message : String(err) });
        }
      }
      return {
        data: { created, failed, target: t },
        summary: `${created.length}/${i.events.length} Termine erstellt${failed.length ? `, ${failed.length} fehlgeschlagen` : ""}`,
        verified: created.every((c) => c.verified) && !failed.length,
      };
    },
  }),
  defineTool({
    name: "calendar.updateEvent",
    title: "Kalendertermin ändern",
    description: "Ändert einen bestehenden Termin (ID aus calendar.listEvents).",
    inputSchema: z.object({
      id: z.string(),
      title: z.string().min(1).max(300).optional(),
      start: isoDateTimeOptional,
      end: isoDateTimeOptional,
      location: z.string().max(500).optional(),
      description: z.string().max(5000).optional(),
    }),
    permission: "WRITE",
    scope: (i) => (i.id.startsWith("google:") ? "external" : "internal"),
    capability: "google-calendar",
    describe: (i) => `Termin ${i.title ? `„${i.title}“ ` : ""}ändern`,
    async execute({ id, ...patch }, ctx) {
      const res = await updateCalendarEvent(ctx.userId, id, patch, ctx.timezone);
      return { data: res.event, summary: `Termin „${res.event.title}“ geändert`, verified: res.verified };
    },
  }),
  defineTool({
    name: "calendar.deleteEvent",
    title: "Kalendertermin löschen",
    description: "Löscht einen Termin.",
    inputSchema: z.object({ id: z.string(), title: z.string().optional().describe("Zur Anzeige im Bestätigungsdialog") }),
    permission: "DELETE",
    scope: (i) => (i.id.startsWith("google:") ? "external" : "internal"),
    capability: "google-calendar",
    describe: (i) => `Termin ${i.title ? `„${i.title}“` : i.id} löschen`,
    async execute({ id }, ctx) {
      await deleteCalendarEvent(ctx.userId, id, ctx.timezone);
      return { data: { id, deleted: true }, summary: "Termin gelöscht", verified: true };
    },
  }),
];

const examOut = (e: { id: string; subject: string; title: string; start: Date; end: Date | null; location: string | null; topics: string[]; source: string }) => ({
  id: e.id,
  subject: e.subject,
  title: e.title,
  start: iso(e.start),
  end: iso(e.end),
  location: e.location,
  topics: e.topics,
  source: e.source,
});

export const examTools = [
  defineTool({
    name: "exams.list",
    title: "Prüfungen suchen",
    description: "Listet anstehende Prüfungen (App, Schulplattform) inkl. geplanter Lernblöcke.",
    inputSchema: z.object({ subject: z.string().optional() }),
    permission: "READ",
    scope: "internal",
    async execute({ subject }, ctx) {
      let exams = await listUpcomingExams(ctx.userId, ctx.now, 30);
      if (subject) exams = exams.filter((e) => `${e.subject} ${e.title}`.toLowerCase().includes(subject.toLowerCase()));
      return {
        data: exams.map((e) => ({ ...examOut(e), studyBlocks: e.events.length, tasks: e.tasks.length })),
        summary: exams.length ? `${exams.length} Prüfung(en), nächste: ${exams[0].subject} am ${formatDateTime(exams[0].start, ctx.timezone)}` : "Keine anstehenden Prüfungen",
        sources: exams.slice(0, 5).map((e) => ({ kind: "exam", id: e.id, title: `${e.subject}: ${e.title}`, url: `/exams/${e.id}` })),
      };
    },
  }),
  defineTool({
    name: "exams.create",
    title: "Prüfung erfassen",
    description: "Erfasst eine Prüfung (z. B. aus „Prüfung Elektrotechnik Freitag 10:00“). Erstellt keinen Kalendertermin – dafür calendar.createEvent mit kind EXAM.",
    inputSchema: z.object({
      subject: z.string().min(1).max(200),
      title: z.string().min(1).max(300),
      start: isoDateTime,
      end: isoDateTimeOptional,
      location: z.string().max(300).optional(),
      topics: z.array(z.string().max(300)).max(50).optional(),
      notes: z.string().max(5000).optional(),
      projectId: z.string().optional(),
    }),
    permission: "WRITE",
    scope: "internal",
    describe: (i) => `Prüfung „${i.subject}: ${i.title}“ erfassen`,
    async execute(input, ctx) {
      const { exam, created } = await upsertExam(ctx.userId, { ...input, source: "AGENT" });
      return { data: examOut(exam), summary: `${created ? "Prüfung erfasst" : "Prüfung aktualisiert"}: ${exam.subject} am ${formatDateTime(exam.start, ctx.timezone)}`, verified: true, sources: [{ kind: "exam", id: exam.id, title: `${exam.subject}: ${exam.title}`, url: `/exams/${exam.id}` }] };
    },
  }),
  defineTool({
    name: "exams.update",
    title: "Prüfung ändern",
    description: "Ändert eine Prüfung, z. B. Themen/Prüfungsstoff ergänzen.",
    inputSchema: z.object({
      id: z.string(),
      title: z.string().max(300).optional(),
      start: isoDateTimeOptional,
      location: z.string().max(300).optional(),
      topics: z.array(z.string().max(300)).max(50).optional(),
      notes: z.string().max(5000).optional(),
    }),
    permission: "WRITE",
    scope: "internal",
    async execute({ id, ...patch }, ctx) {
      const exam = await updateExam(ctx.userId, id, patch);
      return { data: examOut(exam), summary: `Prüfung ${exam.subject} aktualisiert`, verified: true };
    },
  }),
  defineTool({
    name: "exams.planStudy",
    title: "Lernplan erstellen",
    description:
      "Berechnet einen Lernplan für eine Prüfung: verteilt Lerneinheiten auf freie Zeiten (Lernfenster aus den Einstellungen) bis zum Prüfungstag, prüft Konflikte. Erstellt NOCH KEINE Termine – dazu anschließend calendar.createEvents.",
    inputSchema: z.object({
      examId: z.string(),
      topics: z.array(z.string().max(200)).max(40).optional().describe("Themen; Standard: Themen der Prüfung"),
      sessions: z.number().int().min(1).max(30).optional(),
      blockMinutes: z.number().int().min(15).max(240).optional(),
    }),
    permission: "READ",
    scope: "internal",
    async execute(i, ctx) {
      const exam = await getExam(ctx.userId, i.examId);
      const settings = await getUserSettings(ctx.userId);
      const { busy, warnings } = await getBusyIntervals(ctx.userId, { start: ctx.now, end: exam.start }, ctx.timezone);
      const plan = planStudySessions({
        examStart: exam.start,
        now: ctx.now,
        timezone: ctx.timezone,
        busy,
        topics: i.topics ?? exam.topics,
        window: { start: settings.study.windowStart, end: settings.study.windowEnd },
        blockMinutes: i.blockMinutes ?? settings.study.blockMinutes,
        maxBlocksPerDay: settings.study.maxBlocksPerDay,
        sessions: i.sessions,
      });
      const sessions = plan.sessions.map((s) => ({ start: iso(s.start)!, end: iso(s.end)!, topic: s.topic }));
      return {
        data: {
          examId: exam.id,
          exam: `${exam.subject}: ${exam.title}`,
          sessions,
          requested: plan.requested,
          warnings: [...plan.warnings, ...warnings.map((w) => `${w.action}: ${w.reason}`)],
          suggestedEvents: sessions.map((s) => ({ title: `Lernen ${exam.subject}: ${s.topic}`, start: s.start, end: s.end, kind: "STUDY_BLOCK" })),
        },
        summary: `Lernplan mit ${sessions.length} Einheiten bis ${formatDateTime(exam.start, ctx.timezone)}`,
        visualization: {
          type: "study_plan",
          title: `Lernplan ${exam.subject}`,
          sessions: sessions.map((s) => ({ ...s, status: "proposed" as const })),
        },
      };
    },
  }),
];
