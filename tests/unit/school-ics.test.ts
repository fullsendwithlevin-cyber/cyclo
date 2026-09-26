import { describe, expect, it } from "vitest";
import { parseIcs, unfold } from "@/lib/integrations/school/ics";
import { guessSubject, normalizeIcsEvents, topicsFromDescription } from "@/lib/integrations/school/provider";
import { looksLikeExam } from "@/lib/exams/service";

const ICS = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "BEGIN:VEVENT",
  "UID:exam-1@ading",
  "DTSTART;TZID=Europe/Zurich:20261014T100000",
  "DTEND;TZID=Europe/Zurich:20261014T113000",
  "SUMMARY:Elektrotechnik: Prüfung Kap. 3",
  "DESCRIPTION:Themen: Kirchhoff\\, Ohmsches Gesetz\\nNetzwerkanalyse",
  "LOCATION:Raum 204",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:lesson-1@ading",
  "DTSTART:20261015T070000Z",
  "DTEND:20261015T080000Z",
  "SUMMARY:Mathematik Unterricht mit einer sehr langen Beschreibung die umgebr",
  " ochen wurde",
  "RRULE:FREQ=WEEKLY",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:holiday@ading",
  "DTSTART;VALUE=DATE:20261020",
  "SUMMARY:Herbstferien",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:cancelled@ading",
  "DTSTART:20261016T070000Z",
  "SUMMARY:Test Englisch",
  "STATUS:CANCELLED",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

describe("ICS-Parser", () => {
  it("entfaltet umgebrochene Zeilen", () => {
    expect(unfold("A:1\r\n 2\r\nB:3")).toEqual(["A:12", "B:3"]);
  });

  it("liest Zeitzonen, UTC und ganztägige Termine", () => {
    const ev = parseIcs(ICS, "Europe/Zurich");
    expect(ev).toHaveLength(4);
    expect(ev[0].start.toISOString()).toBe("2026-10-14T08:00:00.000Z");
    expect(ev[0].description).toBe("Themen: Kirchhoff, Ohmsches Gesetz\nNetzwerkanalyse");
    expect(ev[1].summary).toContain("umgebrochen wurde");
    expect(ev[1].recurring).toBe(true);
    expect(ev[2].allDay).toBe(true);
  });
});

describe("Schul-Adapter (Normalisierung)", () => {
  const data = normalizeIcsEvents(parseIcs(ICS, "Europe/Zurich"), "school-ics");

  it("erkennt Prüfungen und normalisiert sie", () => {
    expect(data.exams).toHaveLength(1);
    expect(data.exams[0]).toMatchObject({ externalId: "exam-1@ading", subject: "Elektrotechnik", location: "Raum 204" });
    expect(data.exams[0].topics).toEqual(["Kirchhoff", "Ohmsches Gesetz", "Netzwerkanalyse"]);
  });

  it("übernimmt andere Einträge als Termine, ignoriert abgesagte und warnt bei Wiederholungen", () => {
    expect(data.events.map((e) => e.externalId)).toEqual(["lesson-1@ading", "holiday@ading"]);
    expect(data.warnings[0]).toMatch(/wiederkehrende/);
  });

  it("Fach-Erkennung", () => {
    expect(guessSubject({ summary: "Mathe – Test Analysis", categories: [] })).toBe("Mathe");
    expect(guessSubject({ summary: "Prüfung Physik", categories: [] })).toBe("Physik");
    expect(guessSubject({ summary: "irgendwas", categories: ["Chemie"] })).toBe("Chemie");
  });

  it("Prüfungs-Heuristik inkl. Umlauten", () => {
    expect(looksLikeExam("Abschlussprüfung Deutsch")).toBe(true);
    expect(looksLikeExam("Prüfung")).toBe(true);
    expect(looksLikeExam("LK Mathe")).toBe(true);
    expect(looksLikeExam("Testlauf Server")).toBe(false);
    expect(looksLikeExam("Mittagessen")).toBe(false);
  });

  it("Themen aus Beschreibung", () => {
    expect(topicsFromDescription("Stoff: Analysis, Bruchrechnen; Geometrie")).toEqual(["Analysis", "Bruchrechnen", "Geometrie"]);
    expect(topicsFromDescription("keine Angaben")).toEqual([]);
  });
});
