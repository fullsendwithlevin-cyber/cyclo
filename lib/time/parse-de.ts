import { addLocalDays, zonedParts, zonedToUtc } from "./zone";

/**
 * Deterministischer Parser für deutschsprachige Zeitangaben wie
 * „Freitag 10:00“, „morgen 19 Uhr“, „14.10. 10:00“, „übermorgen“, „nächsten Montag um 8“.
 * Wird für Schnelleingaben genutzt; komplexe Fälle übernimmt das Sprachmodell.
 */

const WEEKDAYS: Record<string, number> = {
  sonntag: 0, so: 0,
  montag: 1, mo: 1,
  dienstag: 2, di: 2,
  mittwoch: 3, mi: 3,
  donnerstag: 4, do: 4,
  freitag: 5, fr: 5,
  samstag: 6, sa: 6,
};

export interface ParsedDateTime {
  start: Date;
  /** false, wenn keine Uhrzeit angegeben war */
  hasTime: boolean;
  /** Erkannter Textteil */
  matched: string;
  /** Resttext ohne Datumsangabe (z. B. Titel „Prüfung“) */
  rest: string;
}

export function parseGermanDateTime(input: string, now: Date, tz: string): ParsedDateTime | null {
  const text = input.trim();
  const lower = text.toLowerCase();
  let dayOffset: number | null = null;
  let explicit: { y: number; m: number; d: number } | null = null;
  const matchedParts: string[] = [];

  // Unicode-bewusste Wortgrenzen (\b kennt kein „ü“)
  const rel = lower.match(/(?<!\p{L})(heute|übermorgen|uebermorgen|morgen)(?!\p{L})/u);
  if (rel) {
    dayOffset = rel[1] === "heute" ? 0 : rel[1] === "morgen" ? 1 : 2;
    matchedParts.push(rel[0]);
  }

  // „nächsten Freitag“ wird wie „Freitag“ als der kommende Freitag interpretiert.
  const wd = lower.match(/(?:(?<!\p{L})(?:nächste[nrs]?|naechste[nrs]?|kommende[nrs]?)\s+)?(?<!\p{L})(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)(?!\p{L})/u);
  if (dayOffset === null && wd) {
    const target = WEEKDAYS[wd[1]];
    const today = zonedParts(now, tz).weekday;
    let diff = (target - today + 7) % 7;
    if (diff === 0) diff = 7;
    dayOffset = diff;
    matchedParts.push(wd[0]);
  }

  const dm = lower.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{2,4})?/);
  if (dayOffset === null && dm) {
    const nowP = zonedParts(now, tz);
    let y = dm[3] ? Number(dm[3]) : nowP.year;
    if (y < 100) y += 2000;
    const m = Number(dm[2]);
    const d = Number(dm[1]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      explicit = { y, m, d };
      // Ohne Jahr: vergangenes Datum → nächstes Jahr
      if (!dm[3] && (m < nowP.month || (m === nowP.month && d < nowP.day))) explicit.y += 1;
      matchedParts.push(dm[0]);
    }
  }

  const tm =
    lower.match(/\b(?:um\s+)?(\d{1,2})[:.](\d{2})\s*(?:uhr)?\b/) ?? lower.match(/\b(?:um\s+)?(\d{1,2})\s*uhr\b/) ?? lower.match(/\bum\s+(\d{1,2})\b/);
  let hour: number | null = null;
  let minute = 0;
  if (tm) {
    const h = Number(tm[1]);
    const mi = tm[2] ? Number(tm[2]) : 0;
    // Nicht mit Datumsangabe „14.10.“ verwechseln
    const isDate = dm && tm.index === dm.index;
    if (!isDate && h <= 23 && mi <= 59) {
      hour = h;
      minute = mi;
      matchedParts.push(tm[0]);
    }
  }

  if (dayOffset === null && !explicit && hour === null) return null;

  let start: Date;
  if (explicit) {
    start = zonedToUtc(explicit.y, explicit.m, explicit.d, hour ?? 0, minute, tz);
  } else {
    const base = addLocalDays(now, dayOffset ?? 0, tz);
    const p = zonedParts(base, tz);
    start = zonedToUtc(p.year, p.month, p.day, hour ?? 0, minute, tz);
    // Nur Uhrzeit, bereits vorbei → morgen
    if (dayOffset === null && start < now) {
      const next = addLocalDays(now, 1, tz);
      const q = zonedParts(next, tz);
      start = zonedToUtc(q.year, q.month, q.day, hour ?? 0, minute, tz);
    }
  }

  let rest = text;
  for (const part of matchedParts) {
    const idx = rest.toLowerCase().indexOf(part);
    if (idx >= 0) rest = rest.slice(0, idx) + rest.slice(idx + part.length);
  }
  rest = rest.replace(/\s{2,}/g, " ").replace(/^[\s,:-]+|[\s,:-]+$/g, "").trim();

  return { start, hasTime: hour !== null, matched: matchedParts.join(" "), rest };
}
