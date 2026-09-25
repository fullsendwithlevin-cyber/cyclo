import { db } from "@/lib/database/prisma";
import { getEmbeddingProvider } from "@/lib/ai";
import type { DataSource } from "@/lib/generated/prisma/enums";
import { toVectorLiteral } from "@/lib/documents/pipeline";
import { logger } from "@/lib/observability/audit";

export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  source: DataSource;
  url: string | null;
  content: string;
  page?: number;
  heading?: string;
  score: number;
  matchedBy: ("vector" | "keyword")[];
}

export interface RetrievalOptions {
  limit?: number;
  sources?: DataSource[];
  projectId?: string;
  documentIds?: string[];
}

const STOPWORDS = new Set(
  "der die das und oder aber ein eine einer eines einem einen in im ist sind war was wie wo wer zu zum zur von vom mit auf für über unter aus bei nach vor hat habe haben ich du er sie es wir ihr mein meine meinen meinem dein alles alle etwas nicht noch schon auch nur mir mich dir dich the a an of to and or is are what which how in on for with my me notiert notizen unterlagen steht stehen".split(
    " ",
  ),
);

/** Einfaches Query-Rewriting für die Stichwortsuche: Stoppwörter entfernen, Terme normalisieren. */
export function rewriteQuery(query: string): { keywords: string[]; tsquery: string } {
  const keywords = Array.from(
    new Set(
      query
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s-]/gu, " ")
        .split(/\s+/)
        .filter((w) => w.length > 1 && !STOPWORDS.has(w)),
    ),
  ).slice(0, 12);
  // Präfix-Suche ("kirchhoff:*") und ODER-Verknüpfung für höhere Trefferquote
  const tsquery = keywords.map((k) => `${k.replace(/[':&|!()<>\\-]/g, "")}:*`).filter((k) => k.length > 2).join(" | ");
  return { keywords, tsquery };
}

/** Reciprocal Rank Fusion zweier Ranglisten. */
export function reciprocalRankFusion(lists: string[][], k = 60): Map<string, number> {
  const scores = new Map<string, number>();
  for (const list of lists) list.forEach((id, rank) => scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank + 1)));
  return scores;
}

interface Row {
  id: string;
  documentId: string;
  content: string;
  metadata: { page?: number; heading?: string } | null;
  title: string;
  source: DataSource;
  url: string | null;
  createdAt: Date;
}

/**
 * Hybride Suche: Vektorsuche (pgvector) + Volltext (tsvector), Metadatenfilter,
 * Fusion (RRF) und leichtes Reranking nach Termabdeckung. Liefert Quellen für Zitate.
 */
export async function retrieve(userId: string, query: string, opts: RetrievalOptions = {}): Promise<RetrievedChunk[]> {
  const limit = Math.min(opts.limit ?? 8, 30);
  const { keywords, tsquery } = rewriteQuery(query);
  const sources = opts.sources?.length ? opts.sources : null;
  const docIds = opts.documentIds?.length ? opts.documentIds : null;
  const projectId = opts.projectId ?? null;

  const vectorIds: string[] = [];
  const keywordIds: string[] = [];
  const rows = new Map<string, Row>();

  const embedder = getEmbeddingProvider();
  if (embedder) {
    try {
      const [vec] = await embedder.embed([query]);
      const res = await db.$queryRaw<Row[]>`
        SELECT c.id, c."documentId", c.content, c.metadata, d.title, d.source, d.url, d."createdAt"
        FROM "DocumentChunk" c JOIN "Document" d ON d.id = c."documentId"
        WHERE c."userId" = ${userId} AND c.embedding IS NOT NULL
          AND (${sources}::text[] IS NULL OR d.source::text = ANY(${sources}::text[]))
          AND (${docIds}::text[] IS NULL OR d.id = ANY(${docIds}::text[]))
          AND (${projectId}::text IS NULL OR d."projectId" = ${projectId})
        ORDER BY c.embedding <=> ${toVectorLiteral(vec)}::vector
        LIMIT 30`;
      for (const r of res) (vectorIds.push(r.id), rows.set(r.id, r));
    } catch (err) {
      logger.warn("retrieval.vector_failed", { error: err instanceof Error ? err.message : String(err) });
    }
  }

  if (tsquery) {
    const res = await db.$queryRaw<Row[]>`
      SELECT c.id, c."documentId", c.content, c.metadata, d.title, d.source, d.url, d."createdAt"
      FROM "DocumentChunk" c JOIN "Document" d ON d.id = c."documentId"
      WHERE c."userId" = ${userId}
        AND (c."searchVector" @@ to_tsquery('simple', ${tsquery}) OR d.title ILIKE ${"%" + (keywords[0] ?? "") + "%"})
        AND (${sources}::text[] IS NULL OR d.source::text = ANY(${sources}::text[]))
        AND (${docIds}::text[] IS NULL OR d.id = ANY(${docIds}::text[]))
        AND (${projectId}::text IS NULL OR d."projectId" = ${projectId})
      ORDER BY ts_rank_cd(c."searchVector", to_tsquery('simple', ${tsquery})) DESC
      LIMIT 30`;
    for (const r of res) (keywordIds.push(r.id), rows.set(r.id, r));
  }

  const fused = reciprocalRankFusion([vectorIds, keywordIds]);
  const results: RetrievedChunk[] = [...fused.entries()].map(([id, score]) => {
    const r = rows.get(id)!;
    const lower = r.content.toLowerCase();
    const coverage = keywords.length ? keywords.filter((k) => lower.includes(k)).length / keywords.length : 0;
    const matchedBy: RetrievedChunk["matchedBy"] = [];
    if (vectorIds.includes(id)) matchedBy.push("vector");
    if (keywordIds.includes(id)) matchedBy.push("keyword");
    return {
      chunkId: id,
      documentId: r.documentId,
      documentTitle: r.title,
      source: r.source,
      url: r.url,
      content: r.content,
      page: r.metadata?.page,
      heading: r.metadata?.heading,
      score: score + coverage * 0.01,
      matchedBy,
    };
  });
  results.sort((a, b) => b.score - a.score);

  // Diversität: höchstens 3 Abschnitte pro Dokument
  const perDoc = new Map<string, number>();
  const out: RetrievedChunk[] = [];
  for (const r of results) {
    const n = perDoc.get(r.documentId) ?? 0;
    if (n >= 3) continue;
    perDoc.set(r.documentId, n + 1);
    out.push(r);
    if (out.length >= limit) break;
  }
  return out;
}
