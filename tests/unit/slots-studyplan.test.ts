import { describe, expect, it } from "vitest";
import { findFreeSlots, mergeIntervals, overlaps, subtractBusy } from "@/lib/calendar/slots";
import { planStudySessions } from "@/lib/exams/study-plan";
import { localDateKey, zonedParts, zonedToUtc } from "@/lib/time/zone";

const TZ = "Europe/Zurich";
const at = (d: number, h: number, m = 0) => zonedToUtc(2026, 10, d, h, m, TZ);

describe("Zeitfenster", () => {
  it("führt überlappende Intervalle zusammen", () => {
    const merged = mergeIntervals([{ start: at(1, 10), end: at(1, 12) }, { start: at(1, 11), end: at(1, 13) }, { start: at(1, 15), end: at(1, 16) }]);
    expect(merged).toHaveLength(2);
    expect(merged[0].end.getTime()).toBe(at(1, 13).getTime());
  });

  it("zieht belegte Zeiten ab", () => {
    const free = subtractBusy({ start: at(1, 8), end: at(1, 18) }, [{ start: at(1, 10), end: at(1, 12) }]);
    expect(free).toEqual([{ start: at(1, 8), end: at(1, 10) }, { start: at(1, 12), end: at(1, 18) }]);
  });

  it("findet freie Slots im Lernfenster und respektiert Puffer", () => {
    const slots = findFreeSlots({
      range: { start: at(5, 0), end: at(6, 0) },
      busy: [{ start: at(5, 18), end: at(5, 19) }],
      window: { start: "18:00", end: "21:00" },
      durationMinutes: 45,
      timezone: TZ,
    });
    expect(slots.length).toBeGreaterThan(0);
    for (const s of slots) {
      expect(overlaps(s, { start: at(5, 17, 50), end: at(5, 19, 10) })).toBe(false);
      expect(zonedParts(s.start, TZ).hour).toBeGreaterThanOrEqual(19);
    }
  });
});

describe("Lernplan", () => {
  const now = at(1, 12);
  const exam = at(10, 10);

  it("verteilt Einheiten bis zum Vortag der Prüfung, ohne Konflikte", () => {
    const busy = [{ start: at(3, 18), end: at(3, 22) }];
    const plan = planStudySessions({ examStart: exam, now, timezone: TZ, busy, topics: ["Kirchhoff", "Ohm", "Netzwerke"], window: { start: "18:00", end: "21:00" }, blockMinutes: 45, maxBlocksPerDay: 2 });
    expect(plan.sessions.length).toBe(plan.requested);
    expect(plan.warnings).toEqual([]);
    for (const s of plan.sessions) {
      expect(s.end.getTime()).toBeLessThanOrEqual(zonedToUtc(2026, 10, 10, 0, 0, TZ).getTime());
      expect(s.start.getTime()).toBeGreaterThanOrEqual(zonedToUtc(2026, 10, 2, 0, 0, TZ).getTime());
      expect(localDateKey(s.start, TZ)).not.toBe("2026-10-03");
    }
    // letzte Einheit ist Wiederholung, Themen werden abgedeckt
    expect(plan.sessions.at(-1)!.topic).toMatch(/Wiederholung/);
    expect(plan.sessions.map((s) => s.topic)).toEqual(expect.arrayContaining(["Kirchhoff", "Ohm", "Netzwerke"]));
    // Spaced Repetition: der letzte Tag vor der Prüfung wird genutzt
    expect(localDateKey(plan.sessions.at(-1)!.start, TZ)).toBe("2026-10-09");
  });

  it("maximal N Blöcke pro Tag", () => {
    const plan = planStudySessions({ examStart: at(4, 10), now, timezone: TZ, busy: [], topics: [], window: { start: "18:00", end: "22:00" }, blockMinutes: 30, maxBlocksPerDay: 2, sessions: 10 });
    const perDay = new Map<string, number>();
    for (const s of plan.sessions) perDay.set(localDateKey(s.start, TZ), (perDay.get(localDateKey(s.start, TZ)) ?? 0) + 1);
    expect(Math.max(...perDay.values())).toBeLessThanOrEqual(2);
    expect(plan.warnings[0]).toMatch(/Nur \d+ von 10/);
  });

  it("warnt, wenn keine Zeit mehr bleibt", () => {
    const plan = planStudySessions({ examStart: at(2, 9), now, timezone: TZ, busy: [], topics: ["A"], window: { start: "18:00", end: "21:00" }, blockMinutes: 45, maxBlocksPerDay: 2 });
    expect(plan.sessions).toEqual([]);
    expect(plan.warnings[0]).toMatch(/kein ganzer Tag/);
  });
});
