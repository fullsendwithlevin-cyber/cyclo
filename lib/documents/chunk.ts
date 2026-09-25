import type { ExtractedPage } from "./extract";

export interface Chunk {
  index: number;
  content: string;
  tokenCount: number;
  metadata: { page?: number; heading?: string };
}

/** Grobe Tokenschätzung (≈ 4 Zeichen/Token) – reicht für Chunk-Größen. */
export const estimateTokens = (s: string) => Math.ceil(s.length / 4);

/**
 * Zerlegt Seiten in überlappende Abschnitte entlang von Absatz-/Satzgrenzen.
 * Seiten-/Überschrifteninformationen bleiben für Quellenangaben erhalten.
 */
export function chunkPages(pages: ExtractedPage[], maxChars = 1800, overlap = 200): Chunk[] {
  const chunks: Chunk[] = [];
  for (const page of pages) {
    const text = page.text.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    if (!text) continue;
    const paragraphs = text.split(/\n\n+/);
    let current = "";
    const flush = () => {
      const content = current.trim();
      if (content) chunks.push({ index: chunks.length, content, tokenCount: estimateTokens(content), metadata: { page: page.page, heading: page.heading } });
      current = content.length > overlap ? content.slice(-overlap) : "";
    };
    for (const para of paragraphs) {
      if (para.length > maxChars) {
        for (const sentence of para.split(/(?<=[.!?])\s+/)) {
          if ((current + " " + sentence).length > maxChars) flush();
          if (sentence.length > maxChars) {
            for (let i = 0; i < sentence.length; i += maxChars - overlap) {
              current += sentence.slice(i, i + maxChars - overlap);
              flush();
            }
          } else current += (current ? " " : "") + sentence;
        }
      } else {
        if ((current + "\n\n" + para).length > maxChars) flush();
        current += (current ? "\n\n" : "") + para;
      }
    }
    const rest = current.trim();
    const last = chunks[chunks.length - 1];
    // Nur den Überlappungsrest nicht als eigenen Chunk speichern
    if (rest && !(last && last.content.endsWith(rest) && rest.length <= overlap))
      chunks.push({ index: chunks.length, content: rest, tokenCount: estimateTokens(rest), metadata: { page: page.page, heading: page.heading } });
  }
  return chunks;
}
