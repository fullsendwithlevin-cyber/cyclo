import { MICROSOFT_SCOPES } from "@/lib/integrations/catalog";
import { oauthFetch } from "@/lib/integrations/http";
import { requireScopes } from "@/lib/integrations/vault";
import { htmlToText } from "@/lib/integrations/google/gmail";

const BASE = "https://graph.microsoft.com/v1.0/me/onenote";
const LABEL = "OneNote";

export interface OneNoteNotebook {
  id: string;
  displayName: string;
  lastModifiedDateTime: string;
}
export interface OneNoteSection {
  id: string;
  displayName: string;
  parentNotebook?: { id: string; displayName: string };
}
export interface OneNotePage {
  id: string;
  title: string;
  lastModifiedDateTime: string;
  links?: { oneNoteWebUrl?: { href: string } };
  parentSection?: { id: string; displayName: string };
  parentNotebook?: { id: string; displayName: string };
}

/**
 * OneNote-Zugriff über Microsoft Graph, vollständig hinter diesem Provider gekapselt.
 * Hierarchie: Notebook → Section → Page → Content → Suchindex (Document/DocumentChunk).
 */
export class OneNoteProvider {
  constructor(private userId: string) {}

  private async req<T>(url: string, init: RequestInit & { action: string; raw?: boolean }) {
    await requireScopes(this.userId, "MICROSOFT", ["Notes.Read"], init.action, LABEL);
    return oauthFetch<T>(this.userId, "MICROSOFT", url.startsWith("http") ? url : `${BASE}${url}`, { ...init, capabilityLabel: LABEL });
  }

  async notebooks(): Promise<OneNoteNotebook[]> {
    const res = await this.req<{ value: OneNoteNotebook[] }>("/notebooks?$select=id,displayName,lastModifiedDateTime", { action: "Notizbücher laden" });
    return res.value;
  }

  async sections(notebookId?: string): Promise<OneNoteSection[]> {
    const path = notebookId ? `/notebooks/${encodeURIComponent(notebookId)}/sections` : "/sections";
    const res = await this.req<{ value: OneNoteSection[] }>(`${path}?$expand=parentNotebook($select=id,displayName)`, { action: "Abschnitte laden" });
    return res.value;
  }

  /** Alle Seiten (paginiert), optional nur seit `since` geändert. */
  async pages(opts: { sectionId?: string; since?: Date; max?: number } = {}): Promise<OneNotePage[]> {
    const params = new URLSearchParams({
      $select: "id,title,lastModifiedDateTime,links",
      $expand: "parentSection($select=id,displayName),parentNotebook($select=id,displayName)",
      $top: "100",
      $orderby: "lastModifiedDateTime desc",
    });
    if (opts.since) params.set("$filter", `lastModifiedDateTime ge ${opts.since.toISOString()}`);
    let url: string | undefined = opts.sectionId
      ? `/sections/${encodeURIComponent(opts.sectionId)}/pages?${params}`
      : `/pages?${params}`;
    const out: OneNotePage[] = [];
    while (url && out.length < (opts.max ?? 500)) {
      const res: { value: OneNotePage[]; "@odata.nextLink"?: string } = await this.req(url, { action: "OneNote-Seiten laden" });
      out.push(...res.value);
      url = res["@odata.nextLink"];
    }
    return out;
  }

  async pageContent(pageId: string): Promise<string> {
    const res = await this.req<Response>(`/pages/${encodeURIComponent(pageId)}/content`, { action: "OneNote-Seite lesen", raw: true, headers: { accept: "text/html" } });
    return htmlToText(await res.text());
  }
}
