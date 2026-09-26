import type { Browser, BrowserContext, Page } from "playwright-core";
import { AppError } from "@/lib/errors";
import { assertPublicUrl } from "@/lib/security/ssrf";

/**
 * Headless-Browser für den Agenten (Playwright). Jede Anfrage – auch Unterressourcen und
 * Weiterleitungen – läuft durch den SSRF-Schutz. Sessions sind pro Agent-Run isoliert
 * (eigener Browser-Kontext, keine Cookies des Benutzers) und werden nach Inaktivität geschlossen.
 */

interface Session {
  context: BrowserContext;
  page: Page;
  lastUsed: number;
}

let browserPromise: Promise<Browser> | null = null;
const sessions = new Map<string, Session>();
const hostCache = new Map<string, boolean>();
const IDLE_MS = 5 * 60_000;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = (async () => {
      const { chromium } = await import("playwright-core");
      try {
        return await chromium.launch({
          headless: true,
          executablePath: process.env.BROWSER_EXECUTABLE_PATH || undefined,
        });
      } catch (err) {
        browserPromise = null;
        throw new AppError({
          code: "NOT_CONFIGURED",
          action: "Browser starten",
          reason: `Kein Chromium verfügbar (${err instanceof Error ? err.message.split("\n")[0] : err}).`,
          solution: "Chromium installieren oder BROWSER_EXECUTABLE_PATH setzen.",
        });
      }
    })();
  }
  return browserPromise;
}

async function hostAllowed(url: string): Promise<boolean> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol === "data:" || u.protocol === "blob:") return true;
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const cached = hostCache.get(u.host);
  if (cached !== undefined) return cached;
  const ok = await assertPublicUrl(url, "Browser").then(() => true, () => false);
  hostCache.set(u.host, ok);
  return ok;
}

async function getSession(runId: string): Promise<Session> {
  cleanup();
  let s = sessions.get(runId);
  if (!s) {
    const browser = await getBrowser();
    const context = await browser.newContext({ acceptDownloads: true, javaScriptEnabled: true, locale: "de-CH" });
    await context.route("**/*", async (route) => {
      if (await hostAllowed(route.request().url())) await route.continue();
      else await route.abort("blockedbyclient");
    });
    const page = await context.newPage();
    s = { context, page, lastUsed: Date.now() };
    sessions.set(runId, s);
  }
  s.lastUsed = Date.now();
  return s;
}

function cleanup() {
  const now = Date.now();
  for (const [id, s] of sessions)
    if (now - s.lastUsed > IDLE_MS) {
      sessions.delete(id);
      void s.context.close().catch(() => undefined);
    }
}

export async function closeBrowserSession(runId: string) {
  const s = sessions.get(runId);
  if (s) {
    sessions.delete(runId);
    await s.context.close().catch(() => undefined);
  }
}

export interface PageSnapshot {
  url: string;
  title: string;
  text: string;
  elements: { ref: string; tag: string; type?: string; label: string }[];
}

async function snapshot(page: Page): Promise<PageSnapshot> {
  const data = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll("a[href], button, input, select, textarea, [role=button], [role=link]"));
    const visible = els.filter((el) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    const elements = visible.slice(0, 150).map((el, i) => {
      const ref = `e${i + 1}`;
      el.setAttribute("data-cos-ref", ref);
      const h = el as HTMLInputElement;
      const label =
        h.getAttribute("aria-label") ||
        (h.labels && h.labels[0]?.innerText) ||
        h.placeholder ||
        (el as HTMLElement).innerText ||
        h.value ||
        h.name ||
        "";
      return { ref, tag: el.tagName.toLowerCase(), type: h.type || undefined, label: label.trim().slice(0, 80) };
    });
    return { title: document.title, text: document.body?.innerText ?? "", elements };
  });
  return { url: page.url(), title: data.title, text: data.text.slice(0, 15_000), elements: data.elements };
}

export async function browserOpen(runId: string, url: string): Promise<PageSnapshot> {
  await assertPublicUrl(url, "Webseite öffnen");
  const { page } = await getSession(runId);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  return snapshot(page);
}

function locator(page: Page, ref: string) {
  if (!/^e\d{1,4}$/.test(ref)) throw new AppError({ code: "VALIDATION", action: "Browser", reason: "Ungültige Element-Referenz." });
  return page.locator(`[data-cos-ref="${ref}"]`);
}

async function requirePage(runId: string, action: string) {
  const s = sessions.get(runId);
  if (!s) throw new AppError({ code: "CONFLICT", action, reason: "Es ist keine Seite geöffnet.", solution: "Zuerst browser.open verwenden." });
  s.lastUsed = Date.now();
  return s.page;
}

export async function browserClick(runId: string, ref: string) {
  const page = await requirePage(runId, "Klicken");
  await locator(page, ref).click({ timeout: 10_000 });
  await page.waitForLoadState("domcontentloaded", { timeout: 15_000 }).catch(() => undefined);
  return snapshot(page);
}

export async function browserType(runId: string, ref: string, text: string, submit: boolean) {
  const page = await requirePage(runId, "Eingeben");
  const l = locator(page, ref);
  await l.fill(text, { timeout: 10_000 });
  if (submit) {
    await l.press("Enter");
    await page.waitForLoadState("domcontentloaded", { timeout: 15_000 }).catch(() => undefined);
  }
  return snapshot(page);
}

export async function browserSelect(runId: string, ref: string, value: string) {
  const page = await requirePage(runId, "Auswählen");
  await locator(page, ref).selectOption(value, { timeout: 10_000 });
  return snapshot(page);
}

export async function browserDownload(runId: string, ref: string, maxBytes: number): Promise<{ filename: string; data: Buffer }> {
  const page = await requirePage(runId, "Herunterladen");
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 30_000 }), locator(page, ref).click()]);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream) {
    size += (chunk as Buffer).length;
    if (size > maxBytes) throw new AppError({ code: "VALIDATION", action: "Herunterladen", reason: "Datei ist zu groß." });
    chunks.push(chunk as Buffer);
  }
  return { filename: download.suggestedFilename(), data: Buffer.concat(chunks) };
}
