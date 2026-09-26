import { looksLikeExam } from "@/lib/exams/service";
import { safeFetch } from "@/lib/security/ssrf";
import { AppError } from "@/lib/errors";
import { parseIcs, type IcsEvent } from "./ics";

/**
 * Normalisierte Schuldaten – der Rest des Systems kennt nur diese Typen,
 * nicht die konkrete Plattform (ADING o. a.).
 */
export interface NormalizedExam {
  externalId: string;
  subject: string;
  title: string;
  start: Date;
  end?: Date;
  location?: string;
  topics?: string[];
  source: string;
}

export interface NormalizedSchoolEvent {
  externalId: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  location?: string;
  description?: string;
}

export interface NormalizedSchoolData {
  exams: NormalizedExam[];
  events: NormalizedSchoolEvent[];
  warnings: string[];
}

export interface SchoolProvider {
  readonly id: string;
  readonly label: string;
  fetch(): Promise<NormalizedSchoolData>;
}

/** Fach aus Titel ableiten: „Elektrotechnik: Prüfung Kap. 3“ → „Elektrotechnik“. */
export function guessSubject(e: Pick<IcsEvent, "summary" | "categories">): string {
  if (e.categories[0]) return e.categories[0];
  const m = e.summary.match(/^([^:–\-|]+)[:–\-|]/);
  if (m && m[1].trim().length <= 40) return m[1].trim();
  const cleaned = e.summary.replace(/(?<!\p{L})(prüfung|pruefung|klausur|test|exam|schularbeit|lernkontrolle|lk)(?!\p{L})/giu, "").trim();
  return cleaned.split(/\s+/).slice(0, 3).join(" ") || "Unbekanntes Fach";
}

export function topicsFromDescription(description?: string): string[] {
  if (!description) return [];
  const m = description.match(/(?:themen|stoff|inhalt|topics?)\s*:\s*([\s\S]+)/i);
  const block = m ? m[1] : "";
  return block
    .split(/\n|,|;|•|- /)
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && t.length < 120)
    .slice(0, 30);
}

export function normalizeIcsEvents(events: IcsEvent[], source: string): NormalizedSchoolData {
  const out: NormalizedSchoolData = { exams: [], events: [], warnings: [] };
  const recurring = events.filter((e) => e.recurring).length;
  if (recurring) out.warnings.push(`${recurring} wiederkehrende Einträge wurden nur mit dem ersten Termin übernommen.`);
  for (const e of events) {
    if (e.status === "CANCELLED") continue;
    const text = `${e.summary} ${e.categories.join(" ")}`;
    if (looksLikeExam(text)) {
      out.exams.push({
        externalId: e.uid,
        subject: guessSubject(e),
        title: e.summary,
        start: e.start,
        end: e.end,
        location: e.location,
        topics: topicsFromDescription(e.description),
        source,
      });
    } else {
      out.events.push({
        externalId: e.uid,
        title: e.summary,
        start: e.start,
        end: e.end ?? new Date(e.start.getTime() + (e.allDay ? 864e5 : 3600e3)),
        allDay: e.allDay,
        location: e.location,
        description: e.description,
      });
    }
  }
  return out;
}

/**
 * Adapter für den offiziellen iCal/ICS-Export einer Schulplattform.
 * Es werden keine Zugangsdaten gespeichert und keine Sicherheitsmechanismen umgangen –
 * nur die vom Benutzer bereitgestellte Export-URL wird abgerufen.
 */
export class IcsSchoolAdapter implements SchoolProvider {
  readonly id = "ics";
  readonly label = "Schulplattform (ICS)";
  constructor(private url: string, private timezone: string) {}

  async fetch(): Promise<NormalizedSchoolData> {
    const res = await safeFetch(this.url, { action: "Schulkalender abrufen", maxBytes: 10_000_000, accept: "text/calendar, */*" });
    if (res.status >= 400)
      throw new AppError({
        code: "INTEGRATION_ERROR",
        action: "Schulkalender abrufen",
        reason: `Die Plattform antwortete mit Status ${res.status}.`,
        solution: "ICS-Link in der Schulplattform neu erzeugen und in den Einstellungen hinterlegen.",
      });
    const text = res.body.toString("utf8");
    if (!text.includes("BEGIN:VCALENDAR"))
      throw new AppError({
        code: "INTEGRATION_ERROR",
        action: "Schulkalender abrufen",
        reason: "Die URL liefert keinen iCalendar-Inhalt.",
        solution: "Den Kalender-Export-/Abo-Link (endet oft auf .ics) verwenden – nicht die Login-Seite.",
      });
    return normalizeIcsEvents(parseIcs(text, this.timezone), "school-ics");
  }
}
