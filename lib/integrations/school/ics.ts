import { zonedToUtc } from "@/lib/time/zone";

/** Minimaler, robuster iCalendar-Parser (RFC 5545) für VEVENTs. RRULEs werden nicht expandiert. */

export interface IcsEvent {
  uid: string;
  summary: string;
  description?: string;
  location?: string;
  start: Date;
  end?: Date;
  allDay: boolean;
  categories: string[];
  status?: string;
  recurring: boolean;
}

interface Prop {
  name: string;
  params: Record<string, string>;
  value: string;
}

export function unfold(text: string): string[] {
  return text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").split("\n");
}

function parseLine(line: string): Prop | null {
  const idx = line.search(/:(?=(?:[^"]*"[^"]*")*[^"]*$)/);
  if (idx < 0) return null;
  const [head, value] = [line.slice(0, idx), line.slice(idx + 1)];
  const [name, ...paramParts] = head.split(";");
  const params: Record<string, string> = {};
  for (const p of paramParts) {
    const [k, v] = p.split("=");
    if (k && v !== undefined) params[k.toUpperCase()] = v.replace(/^"|"$/g, "");
  }
  return { name: name.toUpperCase(), params, value };
}

const unescapeText = (v: string) => v.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\;/g, ";").replace(/\\\\/g, "\\");

export function parseIcsDate(prop: Prop, defaultTz: string): { date: Date; allDay: boolean } | null {
  const v = prop.value.trim();
  const dateOnly = v.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnly || prop.params.VALUE === "DATE") {
    const m = dateOnly ?? v.match(/^(\d{4})(\d{2})(\d{2})/);
    if (!m) return null;
    return { date: zonedToUtc(+m[1], +m[2], +m[3], 0, 0, defaultTz), allDay: true };
  }
  const dt = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
  if (!dt) return null;
  const [, y, mo, d, h, mi, s, z] = dt;
  if (z) return { date: new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s ?? 0))), allDay: false };
  let tz = prop.params.TZID ?? defaultTz;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
  } catch {
    tz = defaultTz; // unbekannte (Windows-)Zeitzonen-IDs
  }
  return { date: zonedToUtc(+y, +mo, +d, +h, +mi, tz), allDay: false };
}

export function parseIcs(text: string, defaultTz: string): IcsEvent[] {
  const events: IcsEvent[] = [];
  let current: Prop[] | null = null;
  for (const line of unfold(text)) {
    if (line === "BEGIN:VEVENT") current = [];
    else if (line === "END:VEVENT") {
      if (current) {
        const get = (n: string) => current!.find((p) => p.name === n);
        const start = get("DTSTART") ? parseIcsDate(get("DTSTART")!, defaultTz) : null;
        const end = get("DTEND") ? parseIcsDate(get("DTEND")!, defaultTz) : null;
        const uid = get("UID")?.value;
        if (start && uid)
          events.push({
            uid,
            summary: unescapeText(get("SUMMARY")?.value ?? "(ohne Titel)"),
            description: get("DESCRIPTION") ? unescapeText(get("DESCRIPTION")!.value) : undefined,
            location: get("LOCATION") ? unescapeText(get("LOCATION")!.value) : undefined,
            start: start.date,
            end: end?.date,
            allDay: start.allDay,
            categories: current.filter((p) => p.name === "CATEGORIES").flatMap((p) => unescapeText(p.value).split(",")).map((c) => c.trim()).filter(Boolean),
            status: get("STATUS")?.value,
            recurring: Boolean(get("RRULE")),
          });
      }
      current = null;
    } else if (current) {
      const p = parseLine(line);
      if (p) current.push(p);
    }
  }
  return events;
}
