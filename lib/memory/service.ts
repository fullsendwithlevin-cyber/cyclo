import { z } from "zod";
import { db } from "@/lib/database/prisma";
import { getAIProvider, getEmbeddingProvider, isAIConfigured, textOf } from "@/lib/ai";
import type { Memory } from "@/lib/generated/prisma/client";
import { MemoryType } from "@/lib/generated/prisma/enums";
import { toVectorLiteral } from "@/lib/documents/pipeline";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/observability/audit";

/**
 * Memory-Ebenen:
 *  - Short-term: aktuelle Unterhaltung (Message-Tabelle, nicht hier)
 *  - EPISODIC: wichtige vergangene Ereignisse („Prüfung Mathe am 3.10. bestanden“)
 *  - SEMANTIC: langfristig relevante Fakten („studiert Elektrotechnik an der HF“)
 *  - TASK: laufende Verpflichtungen/Projekte, die nicht als Aufgabe erfasst sind
 *  - PREFERENCE: Präferenzen („lernt am liebsten abends“)
 */
export const memoryInputSchema = z.object({
  type: z.enum(MemoryType),
  content: z.string().trim().min(3).max(1000),
  importance: z.number().min(0).max(1).default(0.5),
  source: z.string().max(50).default("chat"),
  sourceRef: z.string().max(200).nullish(),
  expiresAt: z.coerce.date().nullish(),
});
export type MemoryInput = z.input<typeof memoryInputSchema>;

const normalize = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Regeln, was NICHT gespeichert wird (Geheimnisse, Zugangsdaten, Einmal-Inhalte). */
export function isStorable(content: string): { ok: boolean; reason?: string } {
  if (/(passwort|password|pin|tan|iban|kreditkarte|credit card|api[_ -]?key|token)\s*[:=]/i.test(content))
    return { ok: false, reason: "Enthält vermutlich Zugangsdaten oder Finanzdaten." };
  if (/\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}\b/.test(content)) return { ok: false, reason: "Enthält eine Kartennummer." };
  return { ok: true };
}

/** Heuristische Klassifikation (Fallback, wenn kein Modell verfügbar ist). */
export function classifyMemory(content: string): MemoryType {
  const c = content.toLowerCase();
  if (/\b(bevorzug|lieber|mag |mag\b|möchte immer|am liebsten|prefer|nie vor|nicht vor \d|immer um)\b/.test(c)) return "PREFERENCE";
  if (/\b(projekt|arbeite an|muss noch|bis ende|deadline|abgabe)\b/.test(c)) return "TASK";
  if (/\b(gestern|letzte woche|am \d{1,2}\.|habe .* (bestanden|abgegeben|erledigt)|war )\b/.test(c)) return "EPISODIC";
  return "SEMANTIC";
}

export async function storeMemory(userId: string, raw: MemoryInput): Promise<{ memory: Memory; updated: boolean }> {
  const input = memoryInputSchema.parse(raw);
  const storable = isStorable(input.content);
  if (!storable.ok)
    throw new AppError({ code: "VALIDATION", action: "Erinnerung speichern", reason: `Nicht gespeichert: ${storable.reason}` });

  // Deduplizierung: identischer Inhalt → Wichtigkeit aktualisieren
  const all = await db.memory.findMany({ where: { userId, type: input.type }, select: { id: true, content: true, importance: true } });
  const dup = all.find((m) => normalize(m.content) === normalize(input.content));
  if (dup) {
    const memory = await db.memory.update({
      where: { id: dup.id },
      data: { importance: Math.max(dup.importance, input.importance), lastAccessedAt: new Date() },
    });
    return { memory, updated: true };
  }

  const memory = await db.memory.create({
    data: {
      userId,
      type: input.type,
      content: input.content,
      importance: input.importance,
      source: input.source,
      sourceRef: input.sourceRef ?? null,
      expiresAt: input.expiresAt ?? null,
    },
  });
  const embedder = getEmbeddingProvider();
  if (embedder) {
    try {
      const [vec] = await embedder.embed([input.content]);
      await db.$executeRaw`UPDATE "Memory" SET embedding = ${toVectorLiteral(vec)}::vector WHERE id = ${memory.id}`;
    } catch (err) {
      logger.warn("memory.embed_failed", { error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { memory, updated: false };
}

export async function searchMemories(userId: string, query: string, limit = 8, types?: MemoryType[]) {
  const now = new Date();
  const embedder = getEmbeddingProvider();
  let rows: Memory[] = [];
  if (embedder && query.trim()) {
    try {
      const [vec] = await embedder.embed([query]);
      const typeList = types?.length ? types : null;
      rows = await db.$queryRaw<Memory[]>`
        SELECT id, "userId", type, content, importance, source, "sourceRef", "expiresAt", "lastAccessedAt", "createdAt", "updatedAt"
        FROM "Memory"
        WHERE "userId" = ${userId} AND embedding IS NOT NULL
          AND ("expiresAt" IS NULL OR "expiresAt" > ${now})
          AND (${typeList}::text[] IS NULL OR type::text = ANY(${typeList}::text[]))
        ORDER BY embedding <=> ${toVectorLiteral(vec)}::vector
        LIMIT ${limit}`;
    } catch (err) {
      logger.warn("memory.vector_failed", { error: err instanceof Error ? err.message : String(err) });
    }
  }
  if (!rows.length) {
    const terms = normalize(query).split(" ").filter((t) => t.length > 2).slice(0, 8);
    rows = await db.memory.findMany({
      where: {
        userId,
        type: types?.length ? { in: types } : undefined,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        ...(terms.length ? { AND: [{ OR: terms.map((t) => ({ content: { contains: t, mode: "insensitive" as const } })) }] } : {}),
      },
      orderBy: [{ importance: "desc" }, { updatedAt: "desc" }],
      take: limit,
    });
  }
  if (rows.length)
    await db.memory.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { lastAccessedAt: now } });
  return rows;
}

/** Kontext für den Agenten: alle wichtigen Präferenzen + relevante Fakten zur Anfrage. */
export async function getContextMemories(userId: string, query: string) {
  const [prefs, relevant] = await Promise.all([
    db.memory.findMany({ where: { userId, type: "PREFERENCE" }, orderBy: { importance: "desc" }, take: 10 }),
    searchMemories(userId, query, 8),
  ]);
  const seen = new Set<string>();
  return [...prefs, ...relevant].filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));
}

export const listMemories = (userId: string, type?: MemoryType) =>
  db.memory.findMany({ where: { userId, type }, orderBy: [{ type: "asc" }, { importance: "desc" }], take: 500 });

export async function deleteMemory(userId: string, id: string) {
  const n = await db.memory.deleteMany({ where: { id, userId } });
  if (!n.count) throw new AppError({ code: "NOT_FOUND", action: "Erinnerung löschen", reason: "Nicht gefunden." });
}

const extractionSchema = z.object({
  memories: z
    .array(z.object({ type: z.enum(MemoryType), content: z.string(), importance: z.number().min(0).max(1) }))
    .max(5),
});

/**
 * Extrahiert nach einer Unterhaltung dauerhaft relevante Fakten.
 * Speichert bewusst NICHT jede Nachricht, sondern nur klassifizierte, langlebige Informationen.
 */
export async function extractMemoriesFromExchange(userId: string, userText: string, assistantText: string, sourceRef: string) {
  if (!isAIConfigured() || userText.trim().length < 15) return [];
  const res = await getAIProvider().generate({
    system:
      "Du extrahierst dauerhaft nützliche Fakten über den Benutzer aus einem Gesprächsausschnitt. " +
      "Nur Informationen, die in Wochen noch relevant sind (Präferenzen, Studium/Arbeit, wiederkehrende Verpflichtungen, wichtige Ereignisse). " +
      "Keine Einmal-Fragen, keine Inhalte aus Dokumenten/Mails, keine Zugangsdaten, keine Gesundheits- oder Finanzdetails. " +
      'Antworte ausschließlich mit JSON: {"memories":[{"type":"PREFERENCE|SEMANTIC|EPISODIC|TASK","content":"…","importance":0..1}]}. Leeres Array, wenn nichts relevant ist.',
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: `<user_message>\n${userText.slice(0, 4000)}\n</user_message>\n<assistant_reply>\n${assistantText.slice(0, 2000)}\n</assistant_reply>` }],
      },
    ],
    maxTokens: 2000,
    effort: "low",
  });
  const raw = textOf(res.content).trim().replace(/^```(?:json)?|```$/g, "");
  let parsed: z.infer<typeof extractionSchema>;
  try {
    parsed = extractionSchema.parse(JSON.parse(raw));
  } catch {
    return [];
  }
  const stored: Memory[] = [];
  for (const m of parsed.memories) {
    if (m.importance < 0.4 || !isStorable(m.content).ok) continue;
    const r = await storeMemory(userId, { ...m, source: "chat", sourceRef }).catch(() => null);
    if (r) stored.push(r.memory);
  }
  return stored;
}
