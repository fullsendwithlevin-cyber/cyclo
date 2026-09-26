import { db } from "@/lib/database/prisma";
import { toErrorInfo, type ErrorInfo } from "@/lib/errors";
import { isGoogleCalendarConnected } from "@/lib/calendar/service";
import { GoogleCalendarProvider } from "@/lib/integrations/google/calendar";
import { GmailProvider } from "@/lib/integrations/google/gmail";
import { GOOGLE_SCOPES, hasScopes } from "@/lib/integrations/catalog";
import { searchMemories } from "@/lib/memory/service";
import { retrieve } from "./retrieval";

export type SearchKind = "task" | "project" | "event" | "exam" | "document" | "onenote" | "email" | "memory" | "note";

export const SEARCH_KINDS: { kind: SearchKind; label: string }[] = [
  { kind: "task", label: "Aufgaben" },
  { kind: "project", label: "Projekte" },
  { kind: "event", label: "Kalender" },
  { kind: "exam", label: "Prüfungen" },
  { kind: "document", label: "Dokumente" },
  { kind: "onenote", label: "OneNote" },
  { kind: "email", label: "E-Mails" },
  { kind: "memory", label: "Gedächtnis" },
  { kind: "note", label: "Notizen" },
];

export interface SearchResult {
  kind: SearchKind;
  id: string;
  title: string;
  snippet?: string;
  url: string;
  date?: string;
  score: number;
}

const contains = (q: string) => ({ contains: q, mode: "insensitive" as const });

export async function globalSearch(
  userId: string,
  query: string,
  opts: { timezone: string; kinds?: SearchKind[]; live?: boolean } = { timezone: "Europe/Zurich" },
): Promise<{ results: SearchResult[]; warnings: ErrorInfo[] }> {
  const q = query.trim();
  const want = (k: SearchKind) => !opts.kinds?.length || opts.kinds.includes(k);
  const warnings: ErrorInfo[] = [];
  const results: SearchResult[] = [];
  if (q.length < 2) return { results, warnings };

  const jobs: Promise<void>[] = [];
  if (want("task"))
    jobs.push(
      db.task.findMany({ where: { userId, OR: [{ title: contains(q) }, { description: contains(q) }] }, take: 20, orderBy: { updatedAt: "desc" } }).then((rows) => {
        for (const t of rows) results.push({ kind: "task", id: t.id, title: t.title, snippet: t.description ?? t.status, url: "/tasks", date: t.dueDate?.toISOString(), score: t.status === "DONE" ? 0.4 : 0.8 });
      }),
    );
  if (want("project"))
    jobs.push(
      db.project.findMany({ where: { userId, OR: [{ name: contains(q) }, { description: contains(q) }] }, take: 10 }).then((rows) => {
        for (const p of rows) results.push({ kind: "project", id: p.id, title: p.name, snippet: p.description ?? undefined, url: `/projects/${p.id}`, score: 0.8 });
      }),
    );
  if (want("exam"))
    jobs.push(
      db.exam.findMany({ where: { userId, OR: [{ subject: contains(q) }, { title: contains(q) }, { topics: { has: q } }] }, take: 10, orderBy: { start: "desc" } }).then((rows) => {
        for (const e of rows) results.push({ kind: "exam", id: e.id, title: `${e.subject}: ${e.title}`, snippet: e.topics.join(", "), url: `/exams/${e.id}`, date: e.start.toISOString(), score: 0.85 });
      }),
    );
  if (want("event")) {
    jobs.push(
      db.calendarEvent.findMany({ where: { userId, status: { not: "CANCELLED" }, OR: [{ title: contains(q) }, { description: contains(q) }, { location: contains(q) }] }, take: 15, orderBy: { start: "desc" } }).then((rows) => {
        for (const e of rows) results.push({ kind: "event", id: e.id, title: e.title, snippet: e.location ?? undefined, url: "/calendar", date: e.start.toISOString(), score: 0.7 });
      }),
    );
    if (opts.live !== false)
      jobs.push(
        (async () => {
          if (!(await isGoogleCalendarConnected(userId))) return;
          try {
            const now = Date.now();
            const events = await new GoogleCalendarProvider(userId, opts.timezone).search(q, { start: new Date(now - 180 * 864e5), end: new Date(now + 365 * 864e5) });
            for (const e of events) results.push({ kind: "event", id: e.id, title: e.title, snippet: e.location ?? undefined, url: e.htmlLink ?? "/calendar", date: e.start, score: 0.7 });
          } catch (err) {
            warnings.push(toErrorInfo(err, "Google Calendar durchsuchen"));
          }
        })(),
      );
  }
  if (want("document") || want("onenote"))
    jobs.push(
      retrieve(userId, q, { limit: 15 }).then((chunks) => {
        const seen = new Set<string>();
        for (const c of chunks) {
          if (seen.has(c.documentId)) continue;
          seen.add(c.documentId);
          const kind: SearchKind = c.source === "ONENOTE" ? "onenote" : "document";
          if (!want(kind)) continue;
          results.push({ kind, id: c.documentId, title: c.documentTitle, snippet: c.content.slice(0, 200), url: c.url ?? `/documents/${c.documentId}`, score: 0.6 + Math.min(0.3, c.score * 10) });
        }
      }),
    );
  if (want("email")) {
    jobs.push(
      db.sourceItem.findMany({ where: { userId, source: "GMAIL", OR: [{ title: contains(q) }, { snippet: contains(q) }, { author: contains(q) }] }, take: 10, orderBy: { occurredAt: "desc" } }).then((rows) => {
        for (const m of rows)
          results.push({ kind: "email", id: m.externalId, title: m.title, snippet: `${m.author ?? ""} – ${m.snippet ?? ""}`, url: `https://mail.google.com/mail/u/0/#all/${(m.metadata as { threadId?: string }).threadId ?? m.externalId}`, date: m.occurredAt?.toISOString(), score: 0.6 });
      }),
    );
    if (opts.live !== false)
      jobs.push(
        (async () => {
          const i = await db.integration.findUnique({ where: { userId_provider: { userId, provider: "GOOGLE" } } });
          if (!i || i.status !== "CONNECTED" || !hasScopes(i.scopes, GOOGLE_SCOPES.gmail.slice(0, 1))) return;
          try {
            for (const m of await new GmailProvider(userId).search(q, 8))
              results.push({ kind: "email", id: m.id, title: m.subject, snippet: `${m.from} – ${m.snippet}`, url: `https://mail.google.com/mail/u/0/#all/${m.threadId}`, date: m.date, score: 0.65 });
          } catch (err) {
            warnings.push(toErrorInfo(err, "Gmail durchsuchen"));
          }
        })(),
      );
  }
  if (want("memory"))
    jobs.push(
      searchMemories(userId, q, 5).then((rows) => {
        for (const m of rows) results.push({ kind: "memory", id: m.id, title: m.content, snippet: m.type, url: "/memory", score: 0.5 });
      }),
    );
  if (want("note"))
    jobs.push(
      db.note.findMany({ where: { userId, OR: [{ title: contains(q) }, { content: contains(q) }] }, take: 10 }).then((rows) => {
        for (const n of rows) results.push({ kind: "note", id: n.id, title: n.title, snippet: n.content.slice(0, 200), url: n.projectId ? `/projects/${n.projectId}` : "/documents", score: 0.7 });
      }),
    );

  const settled = await Promise.allSettled(jobs);
  for (const s of settled) if (s.status === "rejected") warnings.push(toErrorInfo(s.reason, "Suche"));

  // Duplikate (z. B. E-Mail aus Sync und Live-Suche) entfernen
  const unique = new Map<string, SearchResult>();
  for (const r of results) {
    const key = `${r.kind}:${r.id}`;
    const prev = unique.get(key);
    if (!prev || prev.score < r.score) unique.set(key, r);
  }
  const lower = q.toLowerCase();
  return {
    results: [...unique.values()]
      .map((r) => ({ ...r, score: r.score + (r.title.toLowerCase().includes(lower) ? 0.2 : 0) }))
      .sort((a, b) => b.score - a.score),
    warnings,
  };
}
