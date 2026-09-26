import { db } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors";
import { api } from "@/lib/http/api";
import { deleteDocument } from "@/lib/documents/pipeline";
import { enqueue } from "@/lib/jobs/queue";

export const GET = api<{ id: string }>(async ({ user, params }) => {
  const document = await db.document.findFirst({
    where: { id: params.id, userId: user.id },
    include: { chunks: { orderBy: { index: "asc" }, take: 200, select: { index: true, content: true, metadata: true } }, project: { select: { id: true, name: true } } },
  });
  if (!document) throw new AppError({ code: "NOT_FOUND", action: "Dokument laden", reason: "Dokument nicht gefunden." });
  return { document };
});

/** Verarbeitung erneut anstoßen (z. B. nachdem ein KI-Provider für OCR konfiguriert wurde). */
export const POST = api<{ id: string }>(async ({ user, params }) => {
  const doc = await db.document.findFirst({ where: { id: params.id, userId: user.id } });
  if (!doc?.storagePath) throw new AppError({ code: "NOT_FOUND", action: "Dokument verarbeiten", reason: "Dokument nicht gefunden." });
  await db.document.update({ where: { id: doc.id }, data: { status: "UPLOADED", error: null } });
  await enqueue("document.process", { documentId: doc.id }, { userId: user.id });
  return { ok: true };
});

export const DELETE = api<{ id: string }>(async ({ user, params }) => {
  await deleteDocument(user.id, params.id);
  return { ok: true };
});
