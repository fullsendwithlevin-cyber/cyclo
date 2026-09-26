import { db } from "@/lib/database/prisma";
import { upsertExternalDocument } from "@/lib/documents/pipeline";
import { OneNoteProvider } from "./onenote";

/**
 * Indexiert geänderte OneNote-Seiten (inkrementell, max. `limit` pro Lauf wegen Graph-Throttling).
 * Pfad: Notebook › Abschnitt › Seite wird als Titel/Metadaten gespeichert (für Quellenangaben).
 */
export async function syncOneNote(userId: string, limit = 40) {
  const integration = await db.integration.findUniqueOrThrow({ where: { userId_provider: { userId, provider: "MICROSOFT" } } });
  const provider = new OneNoteProvider(userId);
  const since = integration.lastSyncAt ?? undefined;
  const pages = await provider.pages({ since, max: 500 });
  let indexed = 0;
  let unchanged = 0;
  for (const page of pages.slice(0, limit)) {
    const text = await provider.pageContent(page.id);
    const notebook = page.parentNotebook?.displayName ?? "Notizbuch";
    const section = page.parentSection?.displayName ?? "Abschnitt";
    const res = await upsertExternalDocument(userId, {
      source: "ONENOTE",
      externalId: page.id,
      title: `${notebook} › ${section} › ${page.title || "Ohne Titel"}`,
      url: page.links?.oneNoteWebUrl?.href ?? null,
      mimeType: "text/html",
      pages: [{ heading: page.title, text }],
      metadata: { notebook, section, pageTitle: page.title, lastModified: page.lastModifiedDateTime },
    });
    if (res.changed) indexed++;
    else unchanged++;
  }
  const complete = pages.length <= limit;
  // lastSyncAt nur setzen, wenn alle geänderten Seiten verarbeitet wurden
  if (complete) await db.integration.update({ where: { id: integration.id }, data: { lastSyncAt: new Date(), lastError: null } });
  return { found: pages.length, indexed, unchanged, complete };
}
