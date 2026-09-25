import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/database/prisma";
import { setAIProviderForTesting, setEmbeddingProviderForTesting, type EmbeddingProvider } from "@/lib/ai";
import { createTask, completeTask, listTasks, updateTask } from "@/lib/tasks/service";
import { processDocument, uploadDocument, readDocumentText, upsertExternalDocument } from "@/lib/documents/pipeline";
import { retrieve } from "@/lib/search/retrieval";
import { searchMemories, storeMemory } from "@/lib/memory/service";
import { upsertExam } from "@/lib/exams/service";
import { processDomainEvent } from "@/lib/automation/processor";
import { claimJobs, completeJob, enqueue, failJob } from "@/lib/jobs/queue";
import { buildDailyBriefing, briefingToText } from "@/lib/briefing/daily";
import { globalSearch } from "@/lib/search/global";
import { createCalendarEvent, getAgenda, confirmProposedEvent } from "@/lib/calendar/service";
import { scanUser } from "@/lib/automation/scanner";
import { updateUserSettings } from "@/lib/users/settings";
import { getCapabilityStatus } from "@/lib/tools/registry";
import { encrypt } from "@/lib/security/crypto";
import { getAccessToken } from "@/lib/integrations/vault";
import { createUser, resetDb } from "../helpers";

const skip = process.env.TEST_DB_UNAVAILABLE === "1";

/** Deterministische Test-Embeddings: Bag-of-Words-Hash auf 1536 Dimensionen. */
class HashEmbeddings implements EmbeddingProvider {
  readonly id = "hash";
  readonly dimensions = 1536;
  async embed(texts: string[]) {
    return texts.map((t) => {
      const v = new Array(1536).fill(0);
      for (const w of t.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean)) {
        let h = 0;
        for (const ch of w) h = (h * 31 + ch.charCodeAt(0)) % 1536;
        v[h] += 1;
      }
      const n = Math.sqrt(v.reduce((a, b) => a + b * b, 0)) || 1;
      return v.map((x) => x / n);
    });
  }
}

describe.skipIf(skip)("Services mit Datenbank", () => {
  beforeEach(async () => {
    await resetDb();
    setEmbeddingProviderForTesting(null);
    setAIProviderForTesting(null);
  });

  describe("Aufgaben", () => {
    it("priorisiert, verhindert Zyklen und blockierte Abschlüsse", async () => {
      const u = await createUser();
      const a = await createTask(u.id, { title: "A", priority: "LOW" });
      const b = await createTask(u.id, { title: "B", priority: "HIGH", dueDate: new Date(Date.now() + 3600e3), dependsOnIds: [a.id] });
      const list = await listTasks(u.id);
      expect(list[0].id).toBe(b.id);
      expect(b.status).toBe("PLANNED");
      await expect(updateTask(u.id, a.id, { dependsOnIds: [b.id] })).rejects.toThrow(/Zyklus/);
      await expect(completeTask(u.id, b.id)).rejects.toThrow(/Offene Abhängigkeiten: A/);
      await completeTask(u.id, a.id);
      const done = await completeTask(u.id, b.id);
      expect(done.completedAt).toBeInstanceOf(Date);
    });

    it("trennt Benutzer strikt (keine fremden Projekte/Aufgaben)", async () => {
      const u1 = await createUser();
      const u2 = await createUser();
      const p = await db.project.create({ data: { userId: u1.id, name: "Geheim" } });
      await expect(createTask(u2.id, { title: "X", projectId: p.id })).rejects.toThrow(/Projekt nicht gefunden/);
      const t = await createTask(u1.id, { title: "Y" });
      await expect(updateTask(u2.id, t.id, { title: "Z" })).rejects.toThrow(/nicht gefunden/);
    });
  });

  describe("Dokumente & RAG", () => {
    it("Upload → Extraktion → Chunks → Volltextsuche mit Quellen", async () => {
      const u = await createUser();
      const { document } = await uploadDocument(u.id, { name: "Elektrotechnik.md", data: Buffer.from("# Kirchhoff\n\nDie Knotenregel besagt: Summe der Ströme = 0.\n\n# Ohm\n\nU = R * I") });
      expect(document.status).toBe("UPLOADED");
      expect(await db.job.count({ where: { type: "document.process" } })).toBe(1);
      await processDocument(document.id);
      const doc = await db.document.findUniqueOrThrow({ where: { id: document.id } });
      expect(doc.status).toBe("INDEXED");
      const hits = await retrieve(u.id, "Was steht zur Knotenregel?");
      expect(hits[0]).toMatchObject({ documentId: document.id, matchedBy: ["keyword"] });
      expect((await readDocumentText(u.id, document.id)).text).toContain("Knotenregel");
      // Duplikate werden erkannt
      expect((await uploadDocument(u.id, { name: "kopie.md", data: Buffer.from("# Kirchhoff\n\nDie Knotenregel besagt: Summe der Ströme = 0.\n\n# Ohm\n\nU = R * I") })).duplicate).toBe(true);
      // Fremde Benutzer finden nichts
      const other = await createUser();
      expect(await retrieve(other.id, "Knotenregel")).toEqual([]);
    });

    it("Vektorsuche mit pgvector findet semantisch passende Abschnitte", async () => {
      setEmbeddingProviderForTesting(new HashEmbeddings());
      const u = await createUser();
      await upsertExternalDocument(u.id, { source: "ONENOTE", externalId: "p1", title: "ET › Netzwerke", mimeType: "text/html", pages: [{ text: "Maschenregel Spannungen Masche Summe" }] });
      await upsertExternalDocument(u.id, { source: "ONENOTE", externalId: "p2", title: "Deutsch › Gedichte", mimeType: "text/html", pages: [{ text: "Goethe Faust Gedicht Analyse" }] });
      const hits = await retrieve(u.id, "Spannungen Masche", { sources: ["ONENOTE"] });
      expect(hits[0].documentTitle).toBe("ET › Netzwerke");
      expect(hits[0].matchedBy).toContain("vector");
      // Unveränderter Inhalt wird nicht neu indexiert
      const again = await upsertExternalDocument(u.id, { source: "ONENOTE", externalId: "p1", title: "ET › Netzwerke", mimeType: "text/html", pages: [{ text: "Maschenregel Spannungen Masche Summe" }] });
      expect(again.changed).toBe(false);
    });
  });

  describe("Gedächtnis", () => {
    it("dedupliziert, lehnt Geheimnisse ab und findet Einträge", async () => {
      const u = await createUser();
      const a = await storeMemory(u.id, { type: "PREFERENCE", content: "Lernt am liebsten abends", importance: 0.6 });
      const b = await storeMemory(u.id, { type: "PREFERENCE", content: "lernt am liebsten Abends!", importance: 0.9 });
      expect(b.updated).toBe(true);
      expect(b.memory.id).toBe(a.memory.id);
      expect(b.memory.importance).toBe(0.9);
      await expect(storeMemory(u.id, { type: "SEMANTIC", content: "Mein Passwort: 1234" })).rejects.toThrow(/Zugangsdaten/);
      expect((await searchMemories(u.id, "abends lernen"))[0].id).toBe(a.memory.id);
    });
  });

  describe("Proaktivität", () => {
    it("neue Prüfung → Event → Relevanz → Benachrichtigung + Automation (bei KI)", async () => {
      const u = await createUser();
      const { exam } = await upsertExam(u.id, { subject: "Mathe", title: "Test", start: new Date(Date.now() + 5 * 864e5), source: "MANUAL" });
      const ev = await db.domainEvent.findFirstOrThrow({ where: { userId: u.id, type: "exam.detected" } });
      const res = await processDomainEvent(ev.id);
      expect(res.notified).toBe(true);
      const n = await db.notification.findFirstOrThrow({ where: { userId: u.id } });
      expect(n).toMatchObject({ title: "Neue Prüfung: Mathe", link: `/exams/${exam.id}` });
      expect(["CRITICAL", "IMPORTANT"]).toContain(n.priority);
      // Ohne KI-Provider wird kein Agent-Lauf gestartet
      expect(res.automations).toEqual([]);
      // Idempotent
      expect(await processDomainEvent(ev.id)).toEqual({ skipped: true });
    });

    it("Relevanzschwelle unterdrückt unwichtige Ereignisse", async () => {
      const u = await createUser();
      await updateUserSettings(u.id, { notificationThreshold: 0.6 });
      const ev = await db.domainEvent.create({ data: { userId: u.id, type: "document.new", payload: { title: "x" } } });
      const res = await processDomainEvent(ev.id);
      expect(res.notified).toBe(false);
      expect(await db.notification.count({ where: { userId: u.id } })).toBe(0);
    });

    it("geänderter Prüfungstermin aus der Schulplattform erzeugt exam.changed", async () => {
      const u = await createUser();
      await upsertExam(u.id, { subject: "Physik", title: "Prüfung", start: new Date("2030-01-10T09:00:00Z"), source: "SCHOOL", externalId: "uid-1" });
      const r = await upsertExam(u.id, { subject: "Physik", title: "Prüfung", start: new Date("2030-01-12T09:00:00Z"), source: "SCHOOL", externalId: "uid-1" });
      expect(r).toMatchObject({ created: false, changed: true });
      expect(await db.exam.count({ where: { userId: u.id } })).toBe(1);
      expect(await db.domainEvent.count({ where: { userId: u.id, type: "exam.changed" } })).toBe(1);
    });

    it("Scanner erkennt Deadlines, Überfälliges und Terminkonflikte (dedupliziert)", async () => {
      const u = await createUser();
      await createTask(u.id, { title: "Abgabe", dueDate: new Date(Date.now() + 5 * 3600e3) });
      await createTask(u.id, { title: "Vergessen", dueDate: new Date(Date.now() - 3600e3), priority: "HIGH" });
      const s = new Date(Date.now() + 864e5);
      await db.calendarEvent.createMany({ data: [{ userId: u.id, title: "A", start: s, end: new Date(s.getTime() + 3600e3) }, { userId: u.id, title: "B", start: new Date(s.getTime() + 1800e3), end: new Date(s.getTime() + 5400e3) }] });
      const r1 = await scanUser(u.id);
      expect(r1.emitted).toBe(3);
      const types = (await db.domainEvent.findMany({ where: { userId: u.id } })).map((e) => e.type).sort();
      expect(types).toEqual(["calendar.conflict", "deadline.approaching", "task.overdue"]);
      expect((await scanUser(u.id)).emitted).toBe(0);
    });

    it("Tagesbriefing aus echten Daten", async () => {
      const u = await createUser();
      const now = new Date();
      await createCalendarEvent(u.id, { title: "Arbeit", start: new Date(now.getTime() + 60e3), end: new Date(now.getTime() + 3600e3) }, "Europe/Zurich", { target: "local" });
      await createTask(u.id, { title: "C-Übung", priority: "HIGH" });
      await upsertExam(u.id, { subject: "Elektronik", title: "Prüfung", start: new Date(now.getTime() + 5 * 864e5), source: "MANUAL" });
      const b = await buildDailyBriefing(u.id, now);
      expect(b.tasks.map((t) => t.title)).toContain("C-Übung");
      expect(b.important.some((i) => i.text.includes("Elektronik") && i.text.includes("noch kein Lernplan"))).toBe(true);
      expect(b.recommendations.length).toBeGreaterThan(0);
      const txt = briefingToText(b, "Europe/Zurich");
      expect(txt).toMatch(/HEUTE[\s\S]*WICHTIG[\s\S]*AUFGABEN[\s\S]*EMPFEHLUNG/);
    });
  });

  describe("Kalender", () => {
    it("vorgeschlagene Termine werden erst nach Bestätigung fest", async () => {
      const u = await createUser();
      const start = new Date(Date.now() + 864e5);
      const { event } = await createCalendarEvent(u.id, { title: "Lernen", start, end: new Date(start.getTime() + 2700e3), kind: "STUDY_BLOCK" }, "Europe/Zurich", { target: "local", status: "PROPOSED" });
      expect(event.status).toBe("PROPOSED");
      const res = await confirmProposedEvent(u.id, event.id, "Europe/Zurich", "local");
      expect(res.event.status).toBe("CONFIRMED");
      const agenda = await getAgenda(u.id, { start: new Date(), end: new Date(Date.now() + 2 * 864e5) }, "Europe/Zurich");
      expect(agenda).toMatchObject({ googleConnected: false, warnings: [] });
      expect(agenda.events).toHaveLength(1);
    });

    it("Google-Termine erfordern eine Verbindung (keine Fake-Daten)", async () => {
      const u = await createUser();
      const start = new Date(Date.now() + 864e5);
      await expect(createCalendarEvent(u.id, { title: "X", start, end: new Date(start.getTime() + 3600e3) }, "Europe/Zurich", { target: "google" })).rejects.toThrow(/nicht verbunden/);
    });
  });

  describe("Integrationen", () => {
    it("abgelaufene Tokens ohne Refresh-Token führen zu klarer Fehlermeldung und Status EXPIRED", async () => {
      const u = await createUser();
      await db.integration.create({ data: { userId: u.id, provider: "GOOGLE", scopes: ["https://www.googleapis.com/auth/calendar.readonly", "https://www.googleapis.com/auth/calendar.events"], accessTokenEnc: encrypt("old"), expiresAt: new Date(Date.now() - 1000) } });
      await expect(getAccessToken(u.id, "GOOGLE", "Kalender laden")).rejects.toThrow(/abgelaufen/);
      const status = await getCapabilityStatus(u.id);
      expect(status.find((s) => s.id === "google-calendar")).toMatchObject({ connected: false, status: "EXPIRED" });
    });
  });

  describe("Job-Queue", () => {
    it("dedupliziert, verteilt ohne Doppelvergabe und wiederholt mit Backoff", async () => {
      await enqueue("test.job", { n: 1 }, { dedupeKey: "k1" });
      expect(await enqueue("test.job", { n: 2 }, { dedupeKey: "k1" })).toBeNull();
      await enqueue("test.job", { n: 3 });
      const [a, b] = await Promise.all([claimJobs("w1", 5), claimJobs("w2", 5)]);
      expect(a.length + b.length).toBe(2);
      expect(new Set([...a, ...b].map((j) => j.id)).size).toBe(2);
      const job = [...a, ...b][0];
      await failJob(job, "kaputt");
      const failed = await db.job.findUniqueOrThrow({ where: { id: job.id } });
      expect(failed.status).toBe("QUEUED");
      expect(failed.runAt.getTime()).toBeGreaterThan(Date.now());
      await completeJob([...a, ...b][1].id);
    });
  });

  describe("Globale Suche", () => {
    it("durchsucht mehrere Quellen und filtert nach Art", async () => {
      const u = await createUser();
      await createTask(u.id, { title: "Kirchhoff üben" });
      await db.note.create({ data: { userId: u.id, title: "Kirchhoff Notiz", content: "..." } });
      await upsertExam(u.id, { subject: "Elektrotechnik", title: "Kirchhoff-Test", start: new Date(Date.now() + 864e5), source: "MANUAL" });
      const all = await globalSearch(u.id, "Kirchhoff", { timezone: "Europe/Zurich" });
      expect(new Set(all.results.map((r) => r.kind))).toEqual(new Set(["task", "note", "exam"]));
      const onlyTasks = await globalSearch(u.id, "Kirchhoff", { timezone: "Europe/Zurich", kinds: ["task"] });
      expect(onlyTasks.results.every((r) => r.kind === "task")).toBe(true);
    });
  });
});
