import { describe, expect, it } from "vitest";
import { buildRawEmail, extractBody, htmlToText } from "@/lib/integrations/google/gmail";
import { heuristicImportance } from "@/lib/integrations/google/sync";
import { mapGoogleEvent } from "@/lib/integrations/google/calendar";
import { priorityForScore, scoreEvent } from "@/lib/automation/relevance";

const b64 = (s: string) => Buffer.from(s).toString("base64url");

describe("Gmail-Adapter", () => {
  it("baut RFC-822-Nachrichten und verhindert Header-Injection", () => {
    const raw = Buffer.from(buildRawEmail({ to: ["a@b.ch\r\nBcc: evil@x.com"], subject: "Prüfung\nBcc: x", body: "Hallo" }), "base64url").toString();
    expect(raw).not.toMatch(/\r\nBcc:/);
    expect(raw).toMatch(/^To: a@b\.ch Bcc: evil@x\.com/);
    expect(raw).toContain("Subject: =?UTF-8?B?");
  });

  it("bevorzugt text/plain und listet Anhänge", () => {
    const res = extractBody({
      mimeType: "multipart/mixed",
      parts: [
        { mimeType: "multipart/alternative", parts: [{ mimeType: "text/plain", body: { size: 5, data: b64("Hallo Welt") } }, { mimeType: "text/html", body: { size: 5, data: b64("<p>Hallo</p>") } }] },
        { mimeType: "application/pdf", filename: "Plan.pdf", body: { size: 1234, attachmentId: "att1" } },
      ],
    });
    expect(res.text).toBe("Hallo Welt");
    expect(res.attachments).toEqual([{ id: "att1", filename: "Plan.pdf", mimeType: "application/pdf", size: 1234 }]);
  });

  it("wandelt HTML ohne Skripte in Text", () => {
    expect(htmlToText("<style>x{}</style><p>A&amp;B</p><script>alert(1)</script><br>C")).toBe("A&B\n\nC");
  });

  it("bewertet Schulmails mit Fristen als wichtig, Werbung nicht", () => {
    expect(heuristicImportance({ from: "sekretariat@schule-bern.ch", subject: "Prüfung verschoben", snippet: "", labels: [] }).score).toBeGreaterThanOrEqual(0.5);
    expect(heuristicImportance({ from: "shop@x.com", subject: "Rabatt", snippet: "", labels: ["CATEGORY_PROMOTIONS"] }).score).toBeLessThan(0.3);
  });
});

describe("Google-Calendar-Mapping", () => {
  it("normalisiert Termine inkl. ganztägig", () => {
    const e = mapGoogleEvent({ id: "x1", summary: "Mathe", start: { dateTime: "2026-10-14T10:00:00+02:00" }, end: { dateTime: "2026-10-14T11:00:00+02:00" }, extendedProperties: { private: { cosKind: "EXAM" } } }, "primary");
    expect(e).toMatchObject({ id: "google:primary:x1", start: "2026-10-14T08:00:00.000Z", kind: "EXAM", allDay: false, source: "GOOGLE_CALENDAR" });
    expect(mapGoogleEvent({ id: "y", start: { date: "2026-10-20" }, end: { date: "2026-10-21" } }, "primary").allDay).toBe(true);
  });
});

describe("Relevanz", () => {
  const now = new Date("2026-10-01T10:00:00Z");
  it("nahe Prüfungen sind kritisch, vergangene irrelevant", () => {
    expect(scoreEvent("exam.detected", { start: "2026-10-03T10:00:00Z" }, now).score).toBeGreaterThanOrEqual(0.9);
    expect(scoreEvent("exam.detected", { start: "2026-09-01T10:00:00Z" }, now).score).toBeLessThan(0.3);
  });
  it("neue Dokumente liegen unter der Standard-Schwelle (kein Spam)", () => {
    expect(scoreEvent("document.new", {}, now).score).toBeLessThan(0.6);
  });
  it("Deadline-Relevanz steigt mit Nähe", () => {
    const soon = scoreEvent("deadline.approaching", { dueDate: "2026-10-01T16:00:00Z" }, now).score;
    const later = scoreEvent("deadline.approaching", { dueDate: "2026-10-04T10:00:00Z" }, now).score;
    expect(soon).toBeGreaterThan(later);
  });
  it("Priorität aus Score", () => {
    expect(priorityForScore(0.95)).toBe("CRITICAL");
    expect(priorityForScore(0.8)).toBe("IMPORTANT");
    expect(priorityForScore(0.55)).toBe("NORMAL");
    expect(priorityForScore(0.2)).toBe("LOW");
  });
});
