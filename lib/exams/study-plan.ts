import type { Interval } from "@/lib/calendar/types";
import { findFreeSlots } from "@/lib/calendar/slots";
import { addLocalDays, localDateKey, startOfLocalDay } from "@/lib/time/zone";

export interface StudyPlanInput {
  examStart: Date;
  now: Date;
  timezone: string;
  busy: Interval[];
  topics: string[];
  window: { start: string; end: string };
  blockMinutes: number;
  maxBlocksPerDay: number;
  /** gewünschte Anzahl Einheiten; Standard aus Themenanzahl */
  sessions?: number;
}

export interface StudySession {
  start: Date;
  end: Date;
  topic: string;
}

export interface StudyPlan {
  sessions: StudySession[];
  requested: number;
  warnings: string[];
}

/**
 * Verteilt Lerneinheiten gleichmäßig (Spaced Repetition) auf freie Zeitfenster
 * zwischen morgen und dem Prüfungstag. Rein funktional → gut testbar.
 */
export function planStudySessions(input: StudyPlanInput): StudyPlan {
  const warnings: string[] = [];
  const topics = input.topics.map((t) => t.trim()).filter(Boolean);
  const requested = input.sessions ?? Math.min(20, Math.max(3, Math.ceil(Math.max(topics.length, 2) * 1.5)));

  const rangeStart = startOfLocalDay(addLocalDays(input.now, 1, input.timezone), input.timezone);
  const rangeEnd = startOfLocalDay(input.examStart, input.timezone);
  if (rangeEnd <= rangeStart) {
    return { sessions: [], requested, warnings: ["Bis zur Prüfung bleibt kein ganzer Tag mehr für eine Lernplanung."] };
  }

  const slots = findFreeSlots({
    range: { start: rangeStart, end: rangeEnd },
    busy: input.busy,
    window: { start: input.window.start, end: input.window.end },
    durationMinutes: input.blockMinutes,
    timezone: input.timezone,
    maxSlots: 1000,
  });

  const byDay = new Map<string, Interval[]>();
  for (const s of slots) {
    const key = localDateKey(s.start, input.timezone);
    const list = byDay.get(key) ?? [];
    if (list.length < input.maxBlocksPerDay) list.push(s);
    byDay.set(key, list);
  }
  const days = [...byDay.keys()].sort();
  if (!days.length) return { sessions: [], requested, warnings: ["Im Lernzeitfenster ist bis zur Prüfung keine freie Zeit verfügbar."] };

  const chosen: Interval[] = [];
  const used = new Map<string, number>();
  // Durchgänge: pro Durchgang höchstens ein Block je Tag, gleichmäßig über die Tage verteilt;
  // der letzte Tag vor der Prüfung wird immer genutzt (Wiederholung).
  while (chosen.length < requested) {
    const remaining = requested - chosen.length;
    const available = days.filter((d) => (used.get(d) ?? 0) < (byDay.get(d)?.length ?? 0));
    if (!available.length) break;
    const take = Math.min(remaining, available.length);
    const picks = new Set<number>();
    for (let i = 0; i < take; i++) {
      const idx = take === 1 ? available.length - 1 : Math.round((i * (available.length - 1)) / (take - 1));
      picks.add(idx);
    }
    for (const idx of picks) {
      const day = available[idx];
      const n = used.get(day) ?? 0;
      chosen.push(byDay.get(day)![n]);
      used.set(day, n + 1);
    }
  }
  chosen.sort((a, b) => a.start.getTime() - b.start.getTime());

  if (chosen.length < requested)
    warnings.push(`Nur ${chosen.length} von ${requested} Lerneinheiten passen in deine freien Zeiten.`);

  const sessions = chosen.map((slot, i) => {
    const isLast = i === chosen.length - 1 && chosen.length > 1;
    let topic: string;
    if (isLast) topic = "Wiederholung & Probeprüfung";
    else if (topics.length) topic = topics[i % topics.length];
    else topic = `Lerneinheit ${i + 1}`;
    return { start: slot.start, end: slot.end, topic };
  });
  return { sessions, requested, warnings };
}
