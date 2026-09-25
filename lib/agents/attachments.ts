import { db } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors";
import { extractText } from "@/lib/documents/extract";
import { readStoredFile } from "@/lib/documents/storage";
import { kindForMime } from "@/lib/documents/validate";
import type { Attachment } from "./orchestrator";

const INLINE_MAX = 10 * 1024 * 1024;

/** Lädt hochgeladene Dateien als Chat-Anhänge: Bilder/PDF direkt fürs Vision-Modell, sonst Text. */
export async function loadAttachments(userId: string, documentIds: string[]): Promise<Attachment[]> {
  const docs = await db.document.findMany({ where: { id: { in: documentIds }, userId } });
  if (docs.length !== new Set(documentIds).size)
    throw new AppError({ code: "NOT_FOUND", action: "Anhang laden", reason: "Anhang nicht gefunden." });
  const out: Attachment[] = [];
  for (const d of docs) {
    const a: Attachment = { documentId: d.id, filename: d.filename, mimeType: d.mimeType };
    const kind = kindForMime(d.mimeType);
    if (d.storagePath && kind) {
      const buf = await readStoredFile(d.storagePath);
      if ((kind.kind === "image" || kind.kind === "pdf") && buf.length <= INLINE_MAX) {
        a.inline = { mediaType: d.mimeType as NonNullable<Attachment["inline"]>["mediaType"], data: buf.toString("base64") };
      } else if (kind.kind !== "image" && kind.kind !== "pdf") {
        const res = await extractText(buf, kind);
        a.text = res.pages.map((p) => (p.heading ? `## ${p.heading}\n${p.text}` : p.text)).join("\n\n");
      }
    }
    out.push(a);
  }
  return out;
}
