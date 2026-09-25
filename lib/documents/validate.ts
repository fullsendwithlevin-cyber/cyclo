import { AppError } from "@/lib/errors";

export interface FileKind {
  mime: string;
  kind: "pdf" | "docx" | "xlsx" | "pptx" | "text" | "image";
}

const EXT: Record<string, FileKind> = {
  pdf: { mime: "application/pdf", kind: "pdf" },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", kind: "docx" },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", kind: "xlsx" },
  pptx: { mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", kind: "pptx" },
  txt: { mime: "text/plain", kind: "text" },
  md: { mime: "text/markdown", kind: "text" },
  csv: { mime: "text/csv", kind: "text" },
  png: { mime: "image/png", kind: "image" },
  jpg: { mime: "image/jpeg", kind: "image" },
  jpeg: { mime: "image/jpeg", kind: "image" },
  webp: { mime: "image/webp", kind: "image" },
  gif: { mime: "image/gif", kind: "image" },
};

export const SUPPORTED_EXTENSIONS = Object.keys(EXT);

function sniff(buf: Buffer): string | null {
  if (buf.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  if (buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) return "zip";
  if (buf[0] === 0x89 && buf.subarray(1, 4).toString("latin1") === "PNG") return "png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "webp";
  if (buf.subarray(0, 3).toString("latin1") === "GIF") return "gif";
  return null;
}

/**
 * Prüft Dateiendung, Größe und Magic Bytes (Inhalt muss zur Endung passen).
 * Verhindert z. B. als PDF getarnte ausführbare Dateien.
 */
export function validateUpload(filename: string, buf: Buffer, maxBytes: number): FileKind {
  const action = "Datei hochladen";
  if (buf.length === 0) throw new AppError({ code: "VALIDATION", action, reason: "Die Datei ist leer." });
  if (buf.length > maxBytes)
    throw new AppError({ code: "VALIDATION", action, reason: `Die Datei ist größer als ${Math.round(maxBytes / 1e6)} MB.` });
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  const kind = EXT[ext];
  if (!kind)
    throw new AppError({
      code: "UNSUPPORTED",
      action,
      reason: `Dateityp „.${ext}“ wird nicht unterstützt.`,
      solution: `Unterstützt: ${SUPPORTED_EXTENSIONS.join(", ")}.`,
    });
  const magic = sniff(buf);
  const ok =
    (kind.kind === "pdf" && magic === "pdf") ||
    (["docx", "xlsx", "pptx"].includes(kind.kind) && magic === "zip") ||
    (kind.kind === "image" && magic !== null && kind.mime.endsWith(magic === "jpeg" ? "jpeg" : magic)) ||
    (kind.kind === "text" && magic === null && !buf.subarray(0, 8000).includes(0));
  if (!ok) throw new AppError({ code: "VALIDATION", action, reason: "Der Dateiinhalt passt nicht zur Dateiendung." });
  return kind;
}

export function kindForMime(mime: string): FileKind | null {
  return Object.values(EXT).find((k) => k.mime === mime) ?? null;
}

export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "datei";
  return base.replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 200) || "datei";
}
