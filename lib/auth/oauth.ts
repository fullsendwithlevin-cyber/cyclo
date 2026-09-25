import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { decryptJson, encryptJson, randomToken, safeEqual } from "@/lib/security/crypto";

/** Generischer OAuth-2.0-Client (Authorization Code + PKCE S256). */

export type OAuthProviderId = "google" | "microsoft";

export interface OAuthProviderConfig {
  id: OAuthProviderId;
  label: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userinfoEndpoint: string;
  clientId: string;
  clientSecret: string;
  extraAuthParams?: Record<string, string>;
}

export function getOAuthProvider(id: OAuthProviderId): OAuthProviderConfig {
  const e = env();
  if (id === "google") {
    if (!e.GOOGLE_CLIENT_ID || !e.GOOGLE_CLIENT_SECRET)
      throw notConfigured("Google", "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET");
    return {
      id,
      label: "Google",
      authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenEndpoint: "https://oauth2.googleapis.com/token",
      userinfoEndpoint: "https://openidconnect.googleapis.com/v1/userinfo",
      clientId: e.GOOGLE_CLIENT_ID,
      clientSecret: e.GOOGLE_CLIENT_SECRET,
      extraAuthParams: { access_type: "offline", include_granted_scopes: "true" },
    };
  }
  if (!e.MICROSOFT_CLIENT_ID || !e.MICROSOFT_CLIENT_SECRET)
    throw notConfigured("Microsoft", "MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET");
  const base = `https://login.microsoftonline.com/${encodeURIComponent(e.MICROSOFT_TENANT)}/oauth2/v2.0`;
  return {
    id,
    label: "Microsoft",
    authorizationEndpoint: `${base}/authorize`,
    tokenEndpoint: `${base}/token`,
    userinfoEndpoint: "https://graph.microsoft.com/oidc/userinfo",
    clientId: e.MICROSOFT_CLIENT_ID,
    clientSecret: e.MICROSOFT_CLIENT_SECRET,
  };
}

export function isOAuthProviderConfigured(id: OAuthProviderId): boolean {
  try {
    getOAuthProvider(id);
    return true;
  } catch {
    return false;
  }
}

function notConfigured(label: string, vars: string) {
  return new AppError({
    code: "NOT_CONFIGURED",
    action: `${label}-Verbindung`,
    reason: `${label}-OAuth ist auf dem Server nicht konfiguriert.`,
    solution: `${vars} in der .env setzen (siehe docs/SETUP.md).`,
  });
}

export const redirectUri = (id: OAuthProviderId) => `${env().APP_URL}/api/oauth/callback/${id}`;

export interface OAuthFlowState {
  provider: OAuthProviderId;
  state: string;
  verifier: string;
  purpose: "login" | "connect";
  scopes: string[];
  /** Nur relative Pfade – verhindert Open Redirects. */
  returnTo: string;
  createdAt: number;
}

const FLOW_COOKIE = "cos_oauth";

export function pkceChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function safeReturnTo(value: string | null | undefined, fallback = "/"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value;
}

export async function beginOAuthFlow(opts: {
  provider: OAuthProviderId;
  scopes: string[];
  purpose: "login" | "connect";
  returnTo?: string;
  loginHint?: string;
}): Promise<string> {
  const p = getOAuthProvider(opts.provider);
  const flow: OAuthFlowState = {
    provider: opts.provider,
    state: randomToken(24),
    verifier: randomToken(48),
    purpose: opts.purpose,
    scopes: opts.scopes,
    returnTo: safeReturnTo(opts.returnTo),
    createdAt: Date.now(),
  };
  const jar = await cookies();
  jar.set(FLOW_COOKIE, encryptJson(flow), {
    httpOnly: true,
    secure: env().NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/oauth",
    maxAge: 600,
  });
  const url = new URL(p.authorizationEndpoint);
  url.searchParams.set("client_id", p.clientId);
  url.searchParams.set("redirect_uri", redirectUri(opts.provider));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", opts.scopes.join(" "));
  url.searchParams.set("state", flow.state);
  url.searchParams.set("code_challenge", pkceChallenge(flow.verifier));
  url.searchParams.set("code_challenge_method", "S256");
  for (const [k, v] of Object.entries(p.extraAuthParams ?? {})) url.searchParams.set(k, v);
  if (opts.purpose === "connect") url.searchParams.set("prompt", "consent");
  if (opts.loginHint) url.searchParams.set("login_hint", opts.loginHint);
  return url.toString();
}

/** Liest + löscht den Flow-Cookie und prüft `state` (CSRF-Schutz des OAuth-Flows). */
export async function consumeOAuthFlow(provider: OAuthProviderId, state: string | null): Promise<OAuthFlowState> {
  const jar = await cookies();
  const raw = jar.get(FLOW_COOKIE)?.value;
  jar.delete({ name: FLOW_COOKIE, path: "/api/oauth" });
  const fail = (reason: string) =>
    new AppError({ code: "FORBIDDEN", action: "Anmeldung", reason, solution: "Vorgang bitte neu starten." });
  if (!raw || !state) throw fail("OAuth-Status fehlt.");
  let flow: OAuthFlowState;
  try {
    flow = decryptJson<OAuthFlowState>(raw);
  } catch {
    throw fail("OAuth-Status ist ungültig.");
  }
  if (flow.provider !== provider || !safeEqual(flow.state, state)) throw fail("OAuth-Status stimmt nicht überein.");
  if (Date.now() - flow.createdAt > 600_000) throw fail("OAuth-Vorgang ist abgelaufen.");
  return flow;
}

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scopes: string[];
  idToken?: string;
}

async function tokenRequest(p: OAuthProviderConfig, body: Record<string, string>, action: string): Promise<TokenSet> {
  const res = await fetch(p.tokenEndpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({ client_id: p.clientId, client_secret: p.clientSecret, ...body }),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || typeof json.access_token !== "string") {
    const expired = json.error === "invalid_grant";
    throw new AppError({
      code: expired ? "INTEGRATION_EXPIRED" : "INTEGRATION_ERROR",
      action,
      reason: expired
        ? `Die ${p.label}-Verbindung ist abgelaufen oder wurde widerrufen.`
        : `${p.label} hat die Token-Anfrage abgelehnt (${String(json.error ?? res.status)}).`,
      solution: `${p.label} in den Einstellungen erneut verbinden.`,
    });
  }
  return {
    accessToken: json.access_token,
    refreshToken: typeof json.refresh_token === "string" ? json.refresh_token : undefined,
    expiresAt: typeof json.expires_in === "number" ? new Date(Date.now() + json.expires_in * 1000) : undefined,
    scopes: typeof json.scope === "string" ? json.scope.split(" ").filter(Boolean) : [],
    idToken: typeof json.id_token === "string" ? json.id_token : undefined,
  };
}

export function exchangeCode(provider: OAuthProviderId, code: string, verifier: string) {
  const p = getOAuthProvider(provider);
  return tokenRequest(
    p,
    { grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: redirectUri(provider) },
    `${p.label}-Anmeldung`,
  );
}

export function refreshAccessToken(provider: OAuthProviderId, refreshToken: string) {
  const p = getOAuthProvider(provider);
  return tokenRequest(p, { grant_type: "refresh_token", refresh_token: refreshToken }, `${p.label}-Token erneuern`);
}

export interface OAuthUserInfo {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
}

export async function fetchUserInfo(provider: OAuthProviderId, accessToken: string): Promise<OAuthUserInfo> {
  const p = getOAuthProvider(provider);
  const res = await fetch(p.userinfoEndpoint, { headers: { authorization: `Bearer ${accessToken}` } });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || typeof json.sub !== "string" || typeof json.email !== "string")
    throw new AppError({
      code: "INTEGRATION_ERROR",
      action: `${p.label}-Anmeldung`,
      reason: "Benutzerprofil konnte nicht gelesen werden.",
      solution: "Erneut anmelden.",
    });
  if (provider === "google" && json.email_verified === false)
    throw new AppError({
      code: "FORBIDDEN",
      action: "Google-Anmeldung",
      reason: "Die E-Mail-Adresse des Google-Kontos ist nicht verifiziert.",
    });
  return {
    sub: json.sub,
    email: json.email.toLowerCase(),
    name: typeof json.name === "string" ? json.name : undefined,
    picture: typeof json.picture === "string" ? json.picture : undefined,
  };
}
