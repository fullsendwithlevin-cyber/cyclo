import { AppError } from "@/lib/errors";
import { GOOGLE_SCOPES } from "@/lib/integrations/catalog";
import { oauthFetch } from "@/lib/integrations/http";
import { requireScopes } from "@/lib/integrations/vault";

const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
const LABEL = "Gmail";

interface GHeader {
  name: string;
  value: string;
}
interface GPart {
  partId?: string;
  mimeType: string;
  filename?: string;
  headers?: GHeader[];
  body?: { size: number; data?: string; attachmentId?: string };
  parts?: GPart[];
}
interface GMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: GPart;
}

export interface EmailSummary {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
  labels: string[];
  unread: boolean;
}

export interface EmailFull extends EmailSummary {
  body: string;
  attachments: { id: string; filename: string; mimeType: string; size: number }[];
}

const header = (p: GPart | undefined, name: string) =>
  p?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";

const b64url = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Durchläuft MIME-Teile: bevorzugt text/plain, sonst text/html → Text. */
export function extractBody(part: GPart | undefined): { text: string; attachments: EmailFull["attachments"] } {
  let plain = "";
  let html = "";
  const attachments: EmailFull["attachments"] = [];
  const walk = (p?: GPart) => {
    if (!p) return;
    if (p.filename && p.body?.attachmentId)
      attachments.push({ id: p.body.attachmentId, filename: p.filename, mimeType: p.mimeType, size: p.body.size });
    else if (p.mimeType === "text/plain" && p.body?.data) plain += b64url(p.body.data);
    else if (p.mimeType === "text/html" && p.body?.data) html += b64url(p.body.data);
    p.parts?.forEach(walk);
  };
  walk(part);
  return { text: plain.trim() || htmlToText(html), attachments };
}

function toSummary(m: GMessage): EmailSummary {
  return {
    id: m.id,
    threadId: m.threadId,
    from: header(m.payload, "From"),
    to: header(m.payload, "To"),
    subject: header(m.payload, "Subject") || "(kein Betreff)",
    date: m.internalDate ? new Date(Number(m.internalDate)).toISOString() : header(m.payload, "Date"),
    snippet: m.snippet ?? "",
    labels: m.labelIds ?? [],
    unread: (m.labelIds ?? []).includes("UNREAD"),
  };
}

/** Header-Injection verhindern (CR/LF in Adressen/Betreff). */
const clean = (s: string) => s.replace(/[\r\n]+/g, " ").trim();
const encodeHeader = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s).toString("base64")}?=`);

export function buildRawEmail(msg: { to: string[]; cc?: string[]; subject: string; body: string; inReplyTo?: string; references?: string }): string {
  const lines = [
    `To: ${msg.to.map(clean).join(", ")}`,
    ...(msg.cc?.length ? [`Cc: ${msg.cc.map(clean).join(", ")}`] : []),
    `Subject: ${encodeHeader(clean(msg.subject))}`,
    ...(msg.inReplyTo ? [`In-Reply-To: ${clean(msg.inReplyTo)}`, `References: ${clean(msg.references ?? msg.inReplyTo)}`] : []),
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(msg.body, "utf8").toString("base64"),
  ];
  return Buffer.from(lines.join("\r\n")).toString("base64url");
}

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

export class GmailProvider {
  constructor(private userId: string) {}

  private async req<T>(path: string, init: RequestInit & { action: string }) {
    await requireScopes(this.userId, "GOOGLE", GOOGLE_SCOPES.gmail.slice(0, 1), init.action, LABEL);
    return oauthFetch<T>(this.userId, "GOOGLE", `${BASE}${path}`, { ...init, capabilityLabel: LABEL });
  }

  async search(query: string, max = 10): Promise<EmailSummary[]> {
    const qs = new URLSearchParams({ q: query, maxResults: String(Math.min(max, 25)) });
    const list = await this.req<{ messages?: { id: string }[] }>(`/messages?${qs}`, { action: "E-Mails suchen" });
    const out: EmailSummary[] = [];
    for (const { id } of list.messages ?? []) {
      const m = await this.req<GMessage>(`/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`, {
        action: "E-Mail laden",
      });
      out.push(toSummary(m));
    }
    return out;
  }

  async read(id: string): Promise<EmailFull> {
    const m = await this.req<GMessage>(`/messages/${encodeURIComponent(id)}?format=full`, { action: "E-Mail lesen" });
    const { text, attachments } = extractBody(m.payload);
    return { ...toSummary(m), body: text, attachments };
  }

  async thread(threadId: string): Promise<EmailFull[]> {
    const t = await this.req<{ messages?: GMessage[] }>(`/threads/${encodeURIComponent(threadId)}?format=full`, { action: "E-Mail-Verlauf lesen" });
    return (t.messages ?? []).map((m) => {
      const { text, attachments } = extractBody(m.payload);
      return { ...toSummary(m), body: text, attachments };
    });
  }

  async labels(): Promise<{ id: string; name: string; type: string }[]> {
    const res = await this.req<{ labels?: { id: string; name: string; type: string }[] }>("/labels", { action: "Labels laden" });
    return res.labels ?? [];
  }

  async attachment(messageId: string, attachmentId: string): Promise<Buffer> {
    const res = await this.req<{ data: string }>(
      `/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
      { action: "Anhang laden" },
    );
    return Buffer.from(res.data.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  }

  private validateRecipients(to: string[], action: string) {
    const bad = to.filter((a) => !EMAIL_RE.test(clean(a).replace(/^.*<(.+)>$/, "$1")));
    if (!to.length || bad.length)
      throw new AppError({ code: "VALIDATION", action, reason: bad.length ? `Ungültige Adresse(n): ${bad.join(", ")}` : "Kein Empfänger angegeben." });
  }

  async createDraft(msg: { to: string[]; cc?: string[]; subject: string; body: string; threadId?: string }) {
    this.validateRecipients(msg.to, "Entwurf erstellen");
    await requireScopes(this.userId, "GOOGLE", ["https://www.googleapis.com/auth/gmail.compose"], "Entwurf erstellen", LABEL);
    const draft = await this.req<{ id: string; message: { id: string; threadId: string } }>("/drafts", {
      method: "POST",
      body: JSON.stringify({ message: { raw: buildRawEmail(msg), threadId: msg.threadId } }),
      action: "Entwurf erstellen",
    });
    // Verifikation: Entwurf erneut lesen
    const check = await this.req<{ id: string }>(`/drafts/${draft.id}`, { action: "Entwurf prüfen" });
    return { draftId: draft.id, messageId: draft.message.id, verified: check.id === draft.id };
  }

  async send(msg: { to: string[]; cc?: string[]; subject: string; body: string; threadId?: string }) {
    this.validateRecipients(msg.to, "E-Mail senden");
    await requireScopes(this.userId, "GOOGLE", ["https://www.googleapis.com/auth/gmail.send"], "E-Mail senden", LABEL);
    const sent = await this.req<{ id: string; threadId: string; labelIds?: string[] }>("/messages/send", {
      method: "POST",
      body: JSON.stringify({ raw: buildRawEmail(msg), threadId: msg.threadId }),
      action: "E-Mail senden",
    });
    const check = await this.req<GMessage>(`/messages/${sent.id}?format=minimal`, { action: "Versand prüfen" });
    return { messageId: sent.id, verified: (check.labelIds ?? []).includes("SENT") };
  }
}
