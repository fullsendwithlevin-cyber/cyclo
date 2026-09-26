export interface CalendarEventDTO {
  id: string;
  title: string;
  start: string; // ISO
  end: string; // ISO
  allDay: boolean;
  location?: string | null;
  description?: string | null;
  source: "MANUAL" | "AGENT" | "GOOGLE_CALENDAR" | "SCHOOL";
  externalId?: string | null;
  calendarId?: string | null;
  kind: "EVENT" | "STUDY_BLOCK" | "EXAM" | "WORK" | "REMINDER";
  status: "CONFIRMED" | "TENTATIVE" | "PROPOSED" | "CANCELLED";
  htmlLink?: string | null;
}

export interface EventDraft {
  title: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  location?: string | null;
  description?: string | null;
  kind?: CalendarEventDTO["kind"];
}

export interface Interval {
  start: Date;
  end: Date;
}

export interface CalendarInfo {
  id: string;
  name: string;
  primary: boolean;
  accessRole: string;
}

/** Schnittstelle für externe Kalender (Google, später Outlook …). */
export interface CalendarProvider {
  readonly id: string;
  listCalendars(): Promise<CalendarInfo[]>;
  listEvents(range: Interval, calendarId?: string): Promise<CalendarEventDTO[]>;
  getEvent(eventId: string, calendarId?: string): Promise<CalendarEventDTO>;
  createEvent(draft: EventDraft, calendarId?: string): Promise<CalendarEventDTO>;
  updateEvent(eventId: string, patch: Partial<EventDraft>, calendarId?: string): Promise<CalendarEventDTO>;
  deleteEvent(eventId: string, calendarId?: string): Promise<void>;
  freeBusy(range: Interval, calendarIds?: string[]): Promise<Interval[]>;
}
