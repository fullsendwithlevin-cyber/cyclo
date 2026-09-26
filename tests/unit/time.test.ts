import { describe, expect, it } from "vitest";
import { addLocalDays, localDateKey, startOfLocalDay, zonedParts, zonedToUtc } from "@/lib/time/zone";
import { parseGermanDateTime } from "@/lib/time/parse-de";

const TZ = "Europe/Zurich";

describe("Zeitzonen", () => {
  it("rechnet lokale Zeit korrekt in UTC um (Sommer- und Winterzeit)", () => {
    expect(zonedToUtc(2026, 7, 1, 10, 0, TZ).toISOString()).toBe("2026-07-01T08:00:00.000Z");
    expect(zonedToUtc(2026, 12, 1, 10, 0, TZ).toISOString()).toBe("2026-12-01T09:00:00.000Z");
  });

  it("addiert Tage über die Zeitumstellung hinweg ohne Stundenversatz", () => {
    const before = zonedToUtc(2026, 10, 24, 19, 0, TZ); // Samstag vor Umstellung
    const after = addLocalDays(before, 1, TZ);
    expect(zonedParts(after, TZ).hour).toBe(19);
    expect(localDateKey(after, TZ)).toBe("2026-10-25");
  });

  it("Tagesbeginn liegt um 00:00 lokal", () => {
    const d = startOfLocalDay(new Date("2026-09-25T15:00:00Z"), TZ);
    expect(d.toISOString()).toBe("2026-09-24T22:00:00.000Z");
  });
});

describe("Deutscher Datumsparser", () => {
  const now = zonedToUtc(2026, 9, 23, 12, 0, TZ); // Mittwoch

  it("„Prüfung Freitag 10:00“", () => {
    const r = parseGermanDateTime("Prüfung Freitag 10:00", now, TZ)!;
    expect(localDateKey(r.start, TZ)).toBe("2026-09-25");
    expect(zonedParts(r.start, TZ).hour).toBe(10);
    expect(r.hasTime).toBe(true);
    expect(r.rest).toBe("Prüfung");
  });

  it("„morgen 19 Uhr Elektrotechnik lernen“", () => {
    const r = parseGermanDateTime("morgen 19 Uhr Elektrotechnik lernen", now, TZ)!;
    expect(localDateKey(r.start, TZ)).toBe("2026-09-24");
    expect(zonedParts(r.start, TZ).hour).toBe(19);
    expect(r.rest).toBe("Elektrotechnik lernen");
  });

  it("„14.10. 10:00 Mathe“ und vergangenes Datum ohne Jahr → nächstes Jahr", () => {
    expect(localDateKey(parseGermanDateTime("14.10. 10:00 Mathe", now, TZ)!.start, TZ)).toBe("2026-10-14");
    expect(localDateKey(parseGermanDateTime("3.2. Test", now, TZ)!.start, TZ)).toBe("2027-02-03");
  });

  it("gleicher Wochentag bedeutet nächste Woche", () => {
    expect(localDateKey(parseGermanDateTime("Mittwoch 8:00", now, TZ)!.start, TZ)).toBe("2026-09-30");
  });

  it("ohne Uhrzeit ganztägig", () => {
    const r = parseGermanDateTime("übermorgen Abgabe", now, TZ)!;
    expect(r.hasTime).toBe(false);
    expect(localDateKey(r.start, TZ)).toBe("2026-09-25");
  });

  it("liefert null ohne Zeitangabe", () => {
    expect(parseGermanDateTime("Einkaufen gehen", now, TZ)).toBeNull();
  });
});
