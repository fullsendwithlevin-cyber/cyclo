import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { AppError } from "@/lib/errors";

/**
 * SSRF-Schutz: nur http(s) zu öffentlichen Adressen. Jede Weiterleitung wird erneut geprüft.
 * Restrisiko DNS-Rebinding (TOCTOU) ist dokumentiert; für höchste Sicherheit einen Egress-Proxy nutzen.
 */

function ipv4ToInt(ip: string) {
  return ip.split(".").reduce((n, o) => (n << 8) + Number(o), 0) >>> 0;
}

const V4_BLOCKS: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

export function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const n = ipv4ToInt(ip);
    return V4_BLOCKS.some(([base, bits]) => {
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      return (n & mask) === (ipv4ToInt(base) & mask);
    });
  }
  const v6 = ip.toLowerCase();
  if (v6 === "::" || v6 === "::1") return true;
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIp(mapped[1]);
  return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v6) || v6.startsWith("64:ff9b:") || v6.startsWith("2001:db8");
}

export async function assertPublicUrl(raw: string, action: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AppError({ code: "VALIDATION", action, reason: "Ungültige URL." });
  }
  if (url.protocol === "webcal:") url = new URL(raw.replace(/^webcal:/, "https:"));
  if (url.protocol !== "https:" && url.protocol !== "http:")
    throw new AppError({ code: "VALIDATION", action, reason: "Nur http(s)-Adressen sind erlaubt." });
  if (url.username || url.password) throw new AppError({ code: "VALIDATION", action, reason: "URLs mit Zugangsdaten sind nicht erlaubt." });
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local"))
    throw new AppError({ code: "FORBIDDEN", action, reason: "Interne Adressen sind nicht erlaubt." });
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (!addresses.length) throw new AppError({ code: "VALIDATION", action, reason: `Host „${host}“ nicht gefunden.` });
  if (addresses.some((a) => isPrivateIp(a.address)))
    throw new AppError({ code: "FORBIDDEN", action, reason: "Die Adresse zeigt auf ein internes Netzwerk (SSRF-Schutz)." });
  return url;
}

export async function safeFetch(raw: string, opts: { action: string; maxBytes?: number; timeoutMs?: number; accept?: string }): Promise<{ url: string; status: number; contentType: string; body: Buffer }> {
  let url = await assertPublicUrl(raw, opts.action);
  for (let hop = 0; hop < 5; hop++) {
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
      headers: { "user-agent": "PersonalAssistant/1.0 (+self-hosted)", accept: opts.accept ?? "*/*" },
    }).catch((err) => {
      throw new AppError({ code: "INTEGRATION_ERROR", action: opts.action, reason: `Abruf fehlgeschlagen: ${err instanceof Error ? err.message : err}` });
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = await assertPublicUrl(new URL(res.headers.get("location")!, url).toString(), opts.action);
      continue;
    }
    const max = opts.maxBytes ?? 5_000_000;
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader)
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > max) {
          await reader.cancel();
          throw new AppError({ code: "VALIDATION", action: opts.action, reason: "Antwort ist zu groß." });
        }
        chunks.push(value);
      }
    return { url: url.toString(), status: res.status, contentType: res.headers.get("content-type") ?? "", body: Buffer.concat(chunks) };
  }
  throw new AppError({ code: "INTEGRATION_ERROR", action: opts.action, reason: "Zu viele Weiterleitungen." });
}
