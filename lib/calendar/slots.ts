import type { Interval } from "./types";
import { addLocalDays, parseHm, zonedParts, zonedToUtc } from "@/lib/time/zone";

export const overlaps = (a: Interval, b: Interval) => a.start < b.end && b.start < a.end;

export function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].sort((a, b) => a.start.getTime() - b.start.getTime());
  const out: Interval[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) {
      if (i.end > last.end) last.end = i.end;
    } else out.push({ start: new Date(i.start), end: new Date(i.end) });
  }
  return out;
}

/** Freie Zeitfenster innerhalb eines Intervalls, abzüglich belegter Zeiten. */
export function subtractBusy(window: Interval, busy: Interval[]): Interval[] {
  const free: Interval[] = [];
  let cursor = window.start;
  for (const b of mergeIntervals(busy)) {
    if (b.end <= cursor || b.start >= window.end) continue;
    if (b.start > cursor) free.push({ start: cursor, end: new Date(Math.min(b.start.getTime(), window.end.getTime())) });
    if (b.end > cursor) cursor = b.end;
    if (cursor >= window.end) break;
  }
  if (cursor < window.end) free.push({ start: cursor, end: window.end });
  return free;
}

export interface DailyWindow {
  start: string; // "HH:mm"
  end: string;
  /** erlaubte Wochentage (0 = So); leer = alle */
  days?: number[];
}

/** Liefert pro lokalem Tag das Fenster [start,end) als UTC-Intervall. */
export function dailyWindows(range: Interval, window: DailyWindow, tz: string): Interval[] {
  const out: Interval[] = [];
  const s = parseHm(window.start);
  const e = parseHm(window.end);
  let day = range.start;
  for (let i = 0; i < 400; i++) {
    const p = zonedParts(day, tz);
    if (!window.days?.length || window.days.includes(p.weekday)) {
      const ws = zonedToUtc(p.year, p.month, p.day, s.hour, s.minute, tz);
      const we = zonedToUtc(p.year, p.month, p.day, e.hour, e.minute, tz);
      const clipped = { start: ws < range.start ? range.start : ws, end: we > range.end ? range.end : we };
      if (clipped.end > clipped.start) out.push(clipped);
    }
    day = addLocalDays(zonedToUtc(p.year, p.month, p.day, 12, 0, tz), 1, tz);
    if (day > range.end) break;
  }
  return out;
}

export interface SlotQuery {
  range: Interval;
  busy: Interval[];
  window: DailyWindow;
  durationMinutes: number;
  timezone: string;
  /** Puffer zwischen Terminen */
  bufferMinutes?: number;
  maxSlots?: number;
}

export function findFreeSlots(q: SlotQuery): Interval[] {
  const buffer = (q.bufferMinutes ?? 10) * 60_000;
  const padded = q.busy.map((b) => ({ start: new Date(b.start.getTime() - buffer), end: new Date(b.end.getTime() + buffer) }));
  const dur = q.durationMinutes * 60_000;
  const slots: Interval[] = [];
  for (const w of dailyWindows(q.range, q.window, q.timezone)) {
    for (const free of subtractBusy(w, padded)) {
      let t = free.start.getTime();
      // auf 15 Minuten runden
      t = Math.ceil(t / 900_000) * 900_000;
      while (t + dur <= free.end.getTime()) {
        slots.push({ start: new Date(t), end: new Date(t + dur) });
        if (slots.length >= (q.maxSlots ?? 200)) return slots;
        t += dur + buffer;
      }
    }
  }
  return slots;
}
