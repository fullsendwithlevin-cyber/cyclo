import { db } from "@/lib/database/prisma";
import { getEmbeddingProvider } from "@/lib/ai";
import { AppError, formatError, toErrorInfo } from "@/lib/errors";
import type { DataSource } from "@/lib/generated/prisma/enums";
import { emitDomainEvent } from "@/lib/automation/events";
import { enqueue } from "@/lib/jobs/queue";
import { env } from "@/lib/env";
import { sha256 } from "@/lib/security/crypto";
import { chunkPages, type Chunk } from "./chunk";
import { extractText, type ExtractedPage } from "./extract";
import { readStoredFile, storeFile } from "./storage";
import { kindForMime, sanitizeFilename, validateUpload } from "./validate";

export const toVectorLiteral = (v: number[]) => `[${v.map((x) => (Number.isFinite(x) ? x : 0)).join(",")}]`;

/**
 * Upload → Validierung → Speicherung → (asynchron) Extraktion/OCR → Chunking → Embedding → Index.
 */
export async function uploadDocument(userId: string, file: { name: string; data: Buffer }, opts: { projectId?: string | null } = {}) {
  const filename = sanitizeFilename(file.name);
  const kind = validateUpload(filename, file.data, env().MAX_UPLOAD_MB * 1024 * 1024);
  if (opts.projectId && !(await db.project.findFirst({ where: { id: opts.projectId, userId } })))
    throw new AppError({ code: "NOT_FOUND", action: "Datei hochladen", reason: "Projekt nicht gefunden." });
  const hash = sha256(file.data);
  const duplicate = await db.document.findFirst({ where: { userId, sha256: hash, source: "UPLOAD" } });
  if (duplicate) return { document: duplicate, duplicate: true };
  const storagePath = await storeFile(userId, hash, file.data);
  const document = await db.document.create({
    data: {
      userId,
      projectId: opts.projectId ?? null,
      title: filename.replace(/\.[^.]+$/, ""),
      filename,
      mimeType: kind.mime,
      size: file.data.length,
      sha256: hash,
      storagePath,
      source: "UPLOAD",
    },
  });
  await enqueue("document.process", { documentId: document.id }, { userId, dedupeKey: `document.process:${document.id}` });
  return { document, duplicate: false };
}

export async function processDocument(documentId: string) {
  const doc = await db.document.findUnique({ where: { id: documentId } });
  if (!doc || !doc.storagePath) return;
  await db.document.update({ where: { id: doc.id }, data: { status: "PROCESSING", error: null } });
  try {
    const kind = kindForMime(doc.mimeType);
    if (!kind) throw new AppError({ code: "UNSUPPORTED", action: "Dokument verarbeiten", reason: `Typ ${doc.mimeType} wird nicht unterstützt.` });
    const buf = await readStoredFile(doc.storagePath);
    const extracted = await extractText(buf, kind);
    const count = await indexText(doc.userId, doc.id, extracted.pages);
    await db.document.update({
      where: { id: doc.id },
      data: {
        status: "INDEXED",
        pageCount: extracted.pageCount ?? null,
        textLength: extracted.pages.reduce((n, p) => n + p.text.length, 0),
        metadata: { extraction: extracted.method, chunks: count },
      },
    });
    await emitDomainEvent(doc.userId, "document.new", { documentId: doc.id, title: doc.title, source: doc.source }, `document.new:${doc.id}`);
  } catch (err) {
    await db.document.update({ where: { id: doc.id }, data: { status: "FAILED", error: formatError(toErrorInfo(err, "Dokument verarbeiten")) } });
    throw err;
  }
}

/** Ersetzt die Chunks eines Dokuments (idempotent) inkl. Volltext- und Vektorindex. */
export async function indexText(userId: string, documentId: string, pages: ExtractedPage[]): Promise<number> {
  const chunks = chunkPages(pages);
  const embedder = getEmbeddingProvider();
  let vectors: number[][] | null = null;
  if (embedder && chunks.length) vectors = await embedder.embed(chunks.map((c) => c.content));
  await db.$transaction(async (tx) => {
    await tx.documentChunk.deleteMany({ where: { documentId } });
    for (const [i, c] of chunks.entries()) await insertChunk(tx, userId, documentId, c, vectors?.[i] ?? null);
  });
  return chunks.length;
}

async function insertChunk(
  tx: Pick<typeof db, "$executeRaw">,
  userId: string,
  documentId: string,
  c: Chunk,
  vector: number[] | null,
) {
  const id = `chk_${sha256(`${documentId}:${c.index}:${Date.now()}:${Math.random()}`).slice(0, 24)}`;
  const meta = JSON.stringify(c.metadata);
  if (vector)
    await tx.$executeRaw`
      INSERT INTO "DocumentChunk" (id, "documentId", "userId", index, content, "tokenCount", metadata, embedding, "searchVector")
      VALUES (${id}, ${documentId}, ${userId}, ${c.index}, ${c.content}, ${c.tokenCount}, ${meta}::jsonb, ${toVectorLiteral(vector)}::vector, to_tsvector('simple', ${c.content}))`;
  else
    await tx.$executeRaw`
      INSERT INTO "DocumentChunk" (id, "documentId", "userId", index, content, "tokenCount", metadata, "searchVector")
      VALUES (${id}, ${documentId}, ${userId}, ${c.index}, ${c.content}, ${c.tokenCount}, ${meta}::jsonb, to_tsvector('simple', ${c.content}))`;
}

/**
 * Importiert Text aus einer externen Quelle (OneNote-Seite, Drive-Datei, Mail-Anhang) als Dokument.
 * Dedupliziert über (Quelle, externe ID) und indexiert nur bei geänderten Inhalten neu.
 */
export async function upsertExternalDocument(
  userId: string,
  input: { source: DataSource; externalId: string; title: string; url?: string | null; mimeType: string; pages: ExtractedPage[]; metadata?: Record<string, unknown> },
) {
  const text = input.pages.map((p) => p.text).join("\n");
  const hash = sha256(text);
  const existing = await db.document.findUnique({
    where: { userId_source_externalId: { userId, source: input.source, externalId: input.externalId } },
  });
  if (existing && existing.sha256 === hash && existing.status === "INDEXED") return { document: existing, changed: false };
  const document = existing
    ? await db.document.update({
        where: { id: existing.id },
        data: { title: input.title, url: input.url ?? null, sha256: hash, size: text.length, status: "PROCESSING", metadata: (input.metadata ?? {}) as object },
      })
    : await db.document.create({
        data: {
          userId,
          title: input.title,
          filename: input.title,
          mimeType: input.mimeType,
          size: text.length,
          sha256: hash,
          source: input.source,
          externalId: input.externalId,
          url: input.url ?? null,
          status: "PROCESSING",
          metadata: (input.metadata ?? {}) as object,
        },
      });
  const chunks = await indexText(userId, document.id, input.pages);
  const updated = await db.document.update({
    where: { id: document.id },
    data: { status: "INDEXED", textLength: text.length, metadata: { ...(input.metadata ?? {}), chunks } },
  });
  return { document: updated, changed: true };
}

export async function deleteDocument(userId: string, id: string) {
  const doc = await db.document.findFirst({ where: { id, userId } });
  if (!doc) throw new AppError({ code: "NOT_FOUND", action: "Dokument löschen", reason: "Dokument nicht gefunden." });
  await db.document.delete({ where: { id } });
  if (doc.storagePath) {
    const others = await db.document.count({ where: { storagePath: doc.storagePath } });
    if (!others) await (await import("./storage")).deleteStoredFile(doc.storagePath);
  }
}

export async function readDocumentText(userId: string, id: string, maxChars = 30_000) {
  const doc = await db.document.findFirst({ where: { id, userId }, include: { chunks: { orderBy: { index: "asc" }, select: { content: true, metadata: true } } } });
  if (!doc) throw new AppError({ code: "NOT_FOUND", action: "Dokument lesen", reason: "Dokument nicht gefunden." });
  if (doc.status !== "INDEXED")
    throw new AppError({
      code: "CONFLICT",
      action: "Dokument lesen",
      reason: doc.status === "FAILED" ? `Verarbeitung fehlgeschlagen: ${doc.error ?? "unbekannt"}` : "Das Dokument wird noch verarbeitet.",
    });
  let text = "";
  for (const c of doc.chunks) {
    // Überlappungen grob entfernen
    const add = text && c.content.startsWith(text.slice(-200)) ? c.content.slice(200) : c.content;
    text += (text ? "\n" : "") + add;
    if (text.length > maxChars) break;
  }
  return { document: doc, text: text.slice(0, maxChars), truncated: text.length > maxChars };
}
