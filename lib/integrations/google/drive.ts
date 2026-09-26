import { AppError } from "@/lib/errors";
import { GOOGLE_SCOPES } from "@/lib/integrations/catalog";
import { oauthFetch } from "@/lib/integrations/http";
import { requireScopes } from "@/lib/integrations/vault";

const BASE = "https://www.googleapis.com/drive/v3";
const LABEL = "Google Drive";

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  webViewLink?: string;
  size?: string;
}

/** Google-Docs-Formate werden beim Import in bearbeitbare Formate exportiert. */
const EXPORTS: Record<string, { mime: string; ext: string }> = {
  "application/vnd.google-apps.document": { mime: "text/plain", ext: "txt" },
  "application/vnd.google-apps.spreadsheet": { mime: "text/csv", ext: "csv" },
  "application/vnd.google-apps.presentation": { mime: "text/plain", ext: "txt" },
};

export class GoogleDriveProvider {
  constructor(private userId: string) {}

  private async req<T>(url: string, init: RequestInit & { action: string; raw?: boolean }) {
    await requireScopes(this.userId, "GOOGLE", GOOGLE_SCOPES.drive, init.action, LABEL);
    return oauthFetch<T>(this.userId, "GOOGLE", url, { ...init, capabilityLabel: LABEL });
  }

  async search(query: string, max = 10): Promise<DriveFile[]> {
    const q = `fullText contains '${query.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}' and trashed = false`;
    const qs = new URLSearchParams({ q, pageSize: String(Math.min(max, 50)), fields: "files(id,name,mimeType,modifiedTime,webViewLink,size)" });
    const res = await this.req<{ files?: DriveFile[] }>(`${BASE}/files?${qs}`, { action: "Drive durchsuchen" });
    return res.files ?? [];
  }

  async download(fileId: string, maxBytes: number): Promise<{ file: DriveFile; data: Buffer; filename: string }> {
    const file = await this.req<DriveFile>(`${BASE}/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,modifiedTime,webViewLink,size`, {
      action: "Drive-Datei laden",
    });
    const exp = EXPORTS[file.mimeType];
    if (!exp && file.mimeType.startsWith("application/vnd.google-apps"))
      throw new AppError({ code: "UNSUPPORTED", action: "Drive-Datei laden", reason: `Google-Format ${file.mimeType} kann nicht importiert werden.` });
    if (!exp && Number(file.size ?? 0) > maxBytes)
      throw new AppError({ code: "VALIDATION", action: "Drive-Datei laden", reason: "Die Datei ist zu groß." });
    const url = exp
      ? `${BASE}/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent(exp.mime)}`
      : `${BASE}/files/${encodeURIComponent(fileId)}?alt=media`;
    const res = await this.req<Response>(url, { action: "Drive-Datei herunterladen", raw: true });
    const data = Buffer.from(await res.arrayBuffer());
    if (data.length > maxBytes) throw new AppError({ code: "VALIDATION", action: "Drive-Datei laden", reason: "Die Datei ist zu groß." });
    const filename = exp ? `${file.name}.${exp.ext}` : file.name;
    return { file, data, filename };
  }
}
