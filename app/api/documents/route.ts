import { db } from "@/lib/database/prisma";
import { DataSource } from "@/lib/generated/prisma/enums";
import { AppError } from "@/lib/errors";
import { api } from "@/lib/http/api";
import { uploadDocument } from "@/lib/documents/pipeline";

export const runtime = "nodejs";

export const GET = api(async ({ user, req }) => {
  const sp = req.nextUrl.searchParams;
  const source = sp.get("source");
  if (source && !(source in DataSource)) throw new AppError({ code: "VALIDATION", action: "Dokumente laden", reason: "Unbekannte Quelle." });
  const documents = await db.document.findMany({
    where: { userId: user.id, projectId: sp.get("projectId") ?? undefined, source: (source as DataSource | null) ?? undefined },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, title: true, filename: true, mimeType: true, size: true, status: true, source: true, url: true, pageCount: true, error: true, createdAt: true, projectId: true },
  });
  return { documents };
});

/** Multipart-Upload (Feld „file“, optional „projectId“). */
export const POST = api(
  async ({ req, user }) => {
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!file || typeof file === "string") throw new AppError({ code: "VALIDATION", action: "Datei hochladen", reason: "Keine Datei übermittelt." });
    const projectId = form?.get("projectId");
    const data = Buffer.from(await file.arrayBuffer());
    const { document, duplicate } = await uploadDocument(user.id, { name: file.name, data }, { projectId: typeof projectId === "string" && projectId ? projectId : null });
    return { document, duplicate };
  },
  { rateLimit: "upload" },
);
