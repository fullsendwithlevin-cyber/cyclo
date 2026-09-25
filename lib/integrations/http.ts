import { AppError } from "@/lib/errors";
import type { IntegrationProvider } from "@/lib/generated/prisma/enums";
import { expiredError, getAccessToken, markExpired } from "./vault";
import { db } from "@/lib/database/prisma";

const LABEL: Record<string, string> = { GOOGLE: "Google", MICROSOFT: "Microsoft" };

/**
 * Authentifizierter JSON-Request gegen Google-/Microsoft-APIs mit einheitlicher Fehlerabbildung
 * (Aktion, Status, Grund, Lösung).
 */
export async function oauthFetch<T>(
  userId: string,
  provider: IntegrationProvider,
  url: string,
  init: RequestInit & { action: string; capabilityLabel: string; raw?: boolean } ,
): Promise<T> {
  const { action, capabilityLabel, raw, ...rest } = init;
  const label = LABEL[provider] ?? provider;
  const token = await getAccessToken(userId, provider, action);
  let res: Response;
  try {
    res = await fetch(url, {
      ...rest,
      headers: { authorization: `Bearer ${token}`, accept: "application/json", ...(rest.body && !(rest.body instanceof FormData) ? { "content-type": "application/json" } : {}), ...rest.headers },
      signal: rest.signal ?? AbortSignal.timeout(30_000),
    });
  } catch (err) {
    throw new AppError({
      code: "INTEGRATION_ERROR",
      action,
      reason: `${capabilityLabel} ist nicht erreichbar (${err instanceof Error ? err.message : "Netzwerkfehler"}).`,
      solution: "Später erneut versuchen.",
    });
  }
  if (res.status === 401) {
    const integration = await db.integration.findUnique({ where: { userId_provider: { userId, provider } } });
    if (integration) await markExpired(integration.id);
    throw expiredError(label, action);
  }
  if (res.status === 403) {
    const body = await res.text();
    const insufficient = /insufficient|scope|permission/i.test(body);
    throw new AppError({
      code: insufficient ? "INTEGRATION_NOT_CONNECTED" : "FORBIDDEN",
      action,
      reason: insufficient
        ? `Für ${capabilityLabel} fehlt die Berechtigung.`
        : `${capabilityLabel} hat den Zugriff verweigert.`,
      solution: `${capabilityLabel} unter Einstellungen → Integrationen (erneut) verbinden.`,
    });
  }
  if (res.status === 404) throw new AppError({ code: "NOT_FOUND", action, reason: `Eintrag in ${capabilityLabel} nicht gefunden.` });
  if (res.status === 429)
    throw new AppError({ code: "RATE_LIMITED", action, reason: `${capabilityLabel}: Ratenlimit erreicht.`, solution: "Einige Minuten warten." });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new AppError({
      code: "INTEGRATION_ERROR",
      action,
      reason: `${capabilityLabel} antwortete mit Status ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}.`,
      solution: "Später erneut versuchen.",
    });
  }
  if (raw) return res as unknown as T;
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
