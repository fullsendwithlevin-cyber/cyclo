import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { safeFetch } from "@/lib/security/ssrf";
import { htmlToText } from "@/lib/integrations/google/gmail";

export interface WebResult {
  title: string;
  url: string;
  description: string;
}

export interface WebSearchProvider {
  search(query: string, count?: number): Promise<WebResult[]>;
}

export const isWebSearchConfigured = () => Boolean(env().BRAVE_SEARCH_API_KEY);

export class BraveSearchProvider implements WebSearchProvider {
  constructor(private apiKey: string) {}
  async search(query: string, count = 8): Promise<WebResult[]> {
    const qs = new URLSearchParams({ q: query, count: String(Math.min(count, 20)), search_lang: "de" });
    const res = await fetch(`https://api.search.brave.com/res/v1/web/search?${qs}`, {
      headers: { accept: "application/json", "x-subscription-token": this.apiKey },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok)
      throw new AppError({ code: "INTEGRATION_ERROR", action: "Websuche", reason: `Brave Search antwortete mit Status ${res.status}.`, solution: "API-Key und Kontingent prüfen." });
    const json = (await res.json()) as { web?: { results?: { title: string; url: string; description?: string }[] } };
    return (json.web?.results ?? []).map((r) => ({ title: r.title, url: r.url, description: htmlToText(r.description ?? "") }));
  }
}

export function getWebSearchProvider(): WebSearchProvider {
  const key = env().BRAVE_SEARCH_API_KEY;
  if (!key)
    throw new AppError({
      code: "NOT_CONFIGURED",
      action: "Websuche",
      reason: "Es ist kein Websuche-Anbieter konfiguriert.",
      solution: "BRAVE_SEARCH_API_KEY in der .env setzen.",
    });
  return new BraveSearchProvider(key);
}

/** Lädt eine öffentliche Seite (SSRF-geschützt) und extrahiert lesbaren Text. */
export async function openWebPage(url: string, maxChars = 20_000) {
  const res = await safeFetch(url, { action: "Webseite öffnen", maxBytes: 3_000_000, accept: "text/html,text/plain;q=0.9,*/*;q=0.5" });
  if (res.status >= 400) throw new AppError({ code: "INTEGRATION_ERROR", action: "Webseite öffnen", reason: `Status ${res.status}.` });
  const raw = res.body.toString("utf8");
  const isHtml = res.contentType.includes("html") || /<html/i.test(raw.slice(0, 500));
  const title = isHtml ? (raw.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "").trim() : "";
  const text = isHtml ? htmlToText(raw) : raw;
  return { url: res.url, title, text: text.slice(0, maxChars), truncated: text.length > maxChars };
}
