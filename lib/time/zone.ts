/** Zeitzonen-Helfer ohne externe Abhängigkeit (Intl-basiert, DST-sicher). */

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0 = Sonntag
}

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function dtf(tz: string) {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    dtfCache.set(tz, f);
  }
  return f;
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function zonedParts(date: Date, tz: string): ZonedParts {
  const parts = Object.fromEntries(dtf(tz).formatToParts(date).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: WEEKDAYS[parts.weekday] ?? 0,
  };
}

function offsetMs(date: Date, tz: string): number {
  const p = zonedParts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Lokale Wanduhrzeit in `tz` → UTC-Date. */
export function zonedToUtc(year: number, month: number, day: number, hour: number, minute: number, tz: string): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const first = guess - offsetMs(new Date(guess), tz);
  const second = guess - offsetMs(new Date(first), tz);
  return new Date(second);
}

/** "YYYY-MM-DD" des Datums in `tz`. */
export function localDateKey(date: Date, tz: string): string {
  const p = zonedParts(date, tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function parseHm(hm: string): { hour: number; minute: number } {
  const [h, m] = hm.split(":").map(Number);
  return { hour: h ?? 0, minute: m ?? 0 };
}

/** Beginn des lokalen Tages (00:00 in tz) als UTC-Date. */
export function startOfLocalDay(date: Date, tz: string): Date {
  const p = zonedParts(date, tz);
  return zonedToUtc(p.year, p.month, p.day, 0, 0, tz);
}

/** Addiert Kalendertage in `tz` (DST-sicher). */
export function addLocalDays(date: Date, days: number, tz: string): Date {
  const p = zonedParts(date, tz);
  const base = new Date(Date.UTC(p.year, p.month - 1, p.day + days));
  return zonedToUtc(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), p.hour, p.minute, tz);
}

export function formatLocal(date: Date, tz: string, locale = "de-CH", opts: Intl.DateTimeFormatOptions = {}) {
  return new Intl.DateTimeFormat(locale, { timeZone: tz, ...opts }).format(date);
}

export const formatDateTime = (d: Date, tz: string) =>
  formatLocal(d, tz, "de-CH", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
export const formatTime = (d: Date, tz: string) => formatLocal(d, tz, "de-CH", { hour: "2-digit", minute: "2-digit" });
export const formatDate = (d: Date, tz: string) => formatLocal(d, tz, "de-CH", { weekday: "short", day: "numeric", month: "long" });
