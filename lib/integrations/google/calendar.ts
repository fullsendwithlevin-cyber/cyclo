import type { CalendarEventDTO, CalendarInfo, CalendarProvider, EventDraft, Interval } from "@/lib/calendar/types";
import { oauthFetch } from "@/lib/integrations/http";
import { GOOGLE_SCOPES } from "@/lib/integrations/catalog";
import { requireScopes } from "@/lib/integrations/vault";

const BASE = "https://www.googleapis.com/calendar/v3";
const LABEL = "Google Calendar";

interface GEventDate {
  date?: string;
  dateTime?: string;
  timeZone?: string;
}
interface GEvent {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  start: GEventDate;
  end: GEventDate;
  extendedProperties?: { private?: Record<string, string> };
}

export function mapGoogleEvent(e: GEvent, calendarId: string): CalendarEventDTO {
  const allDay = Boolean(e.start.date && !e.start.dateTime);
  const start = e.start.dateTime ?? `${e.start.date}T00:00:00Z`;
  const end = e.end.dateTime ?? `${e.end.date}T00:00:00Z`;
  const kind = (e.extendedProperties?.private?.cosKind as CalendarEventDTO["kind"]) ?? "EVENT";
  return {
    id: `google:${calendarId}:${e.id}`,
    title: e.summary ?? "(ohne Titel)",
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
    allDay,
    location: e.location ?? null,
    description: e.description ?? null,
    source: "GOOGLE_CALENDAR",
    externalId: e.id,
    calendarId,
    kind,
    status: e.status === "tentative" ? "TENTATIVE" : e.status === "cancelled" ? "CANCELLED" : "CONFIRMED",
    htmlLink: e.htmlLink ?? null,
  };
}

function toGoogleBody(d: Partial<EventDraft>, tz: string) {
  const body: Record<string, unknown> = {};
  if (d.title !== undefined) body.summary = d.title;
  if (d.description !== undefined) body.description = d.description ?? "";
  if (d.location !== undefined) body.location = d.location ?? "";
  if (d.start) body.start = d.allDay ? { date: d.start.toISOString().slice(0, 10) } : { dateTime: d.start.toISOString(), timeZone: tz };
  if (d.end) body.end = d.allDay ? { date: d.end.toISOString().slice(0, 10) } : { dateTime: d.end.toISOString(), timeZone: tz };
  if (d.kind) body.extendedProperties = { private: { cosKind: d.kind, cosCreatedBy: "assistant" } };
  return body;
}

export class GoogleCalendarProvider implements CalendarProvider {
  readonly id = "google";
  constructor(private userId: string, private timezone: string) {}

  private async req<T>(path: string, init: RequestInit & { action: string }) {
    await requireScopes(this.userId, "GOOGLE", GOOGLE_SCOPES.calendar, init.action, LABEL);
    return oauthFetch<T>(this.userId, "GOOGLE", `${BASE}${path}`, { ...init, capabilityLabel: LABEL });
  }

  async listCalendars(): Promise<CalendarInfo[]> {
    const res = await this.req<{ items?: { id: string; summary: string; primary?: boolean; accessRole: string }[] }>(
      "/users/me/calendarList?maxResults=250",
      { action: "Kalender auflisten" },
    );
    return (res.items ?? []).map((c) => ({ id: c.id, name: c.summary, primary: Boolean(c.primary), accessRole: c.accessRole }));
  }

  async listEvents(range: Interval, calendarId = "primary"): Promise<CalendarEventDTO[]> {
    const out: CalendarEventDTO[] = [];
    let pageToken: string | undefined;
    do {
      const qs = new URLSearchParams({
        timeMin: range.start.toISOString(),
        timeMax: range.end.toISOString(),
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "250",
      });
      if (pageToken) qs.set("pageToken", pageToken);
      const res = await this.req<{ items?: GEvent[]; nextPageToken?: string }>(
        `/calendars/${encodeURIComponent(calendarId)}/events?${qs}`,
        { action: "Termine laden" },
      );
      for (const e of res.items ?? []) if (e.status !== "cancelled") out.push(mapGoogleEvent(e, calendarId));
      pageToken = res.nextPageToken;
    } while (pageToken && out.length < 2000);
    return out;
  }

  async search(query: string, range: Interval, max = 20): Promise<CalendarEventDTO[]> {
    const qs = new URLSearchParams({
      q: query,
      timeMin: range.start.toISOString(),
      timeMax: range.end.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: String(max),
    });
    const res = await this.req<{ items?: GEvent[] }>(`/calendars/primary/events?${qs}`, { action: "Termine suchen" });
    return (res.items ?? []).filter((e) => e.status !== "cancelled").map((e) => mapGoogleEvent(e, "primary"));
  }

  async getEvent(eventId: string, calendarId = "primary") {
    const e = await this.req<GEvent>(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
      action: "Termin laden",
    });
    return mapGoogleEvent(e, calendarId);
  }

  async createEvent(draft: EventDraft, calendarId = "primary") {
    const e = await this.req<GEvent>(`/calendars/${encodeURIComponent(calendarId)}/events`, {
      method: "POST",
      body: JSON.stringify(toGoogleBody(draft, this.timezone)),
      action: "Termin in Google Calendar erstellen",
    });
    return mapGoogleEvent(e, calendarId);
  }

  async updateEvent(eventId: string, patch: Partial<EventDraft>, calendarId = "primary") {
    const e = await this.req<GEvent>(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
      method: "PATCH",
      body: JSON.stringify(toGoogleBody(patch, this.timezone)),
      action: "Termin in Google Calendar ändern",
    });
    return mapGoogleEvent(e, calendarId);
  }

  async deleteEvent(eventId: string, calendarId = "primary") {
    await this.req<void>(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
      method: "DELETE",
      action: "Termin in Google Calendar löschen",
    });
  }

  async freeBusy(range: Interval, calendarIds: string[] = ["primary"]): Promise<Interval[]> {
    const res = await this.req<{ calendars: Record<string, { busy?: { start: string; end: string }[] }> }>("/freeBusy", {
      method: "POST",
      body: JSON.stringify({
        timeMin: range.start.toISOString(),
        timeMax: range.end.toISOString(),
        items: calendarIds.map((id) => ({ id })),
      }),
      action: "Frei/Belegt abfragen",
    });
    return Object.values(res.calendars ?? {}).flatMap((c) =>
      (c.busy ?? []).map((b) => ({ start: new Date(b.start), end: new Date(b.end) })),
    );
  }
}
