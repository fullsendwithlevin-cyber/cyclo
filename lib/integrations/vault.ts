import { db } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors";
import type { IntegrationProvider } from "@/lib/generated/prisma/enums";
import { refreshAccessToken, type OAuthProviderId, type TokenSet } from "@/lib/auth/oauth";
import { decrypt, encrypt } from "@/lib/security/crypto";
import { audit } from "@/lib/observability/audit";

const OAUTH_PROVIDER: Partial<Record<IntegrationProvider, OAuthProviderId>> = {
  GOOGLE: "google",
  MICROSOFT: "microsoft",
};

const LABEL: Record<IntegrationProvider, string> = {
  GOOGLE: "Google",
  MICROSOFT: "Microsoft",
  SCHOOL_ICS: "Schulplattform",
  WEB_SEARCH: "Websuche",
};

export async function saveOAuthTokens(
  userId: string,
  provider: IntegrationProvider,
  tokens: TokenSet,
  accountEmail: string,
  requestedScopes: string[],
) {
  const existing = await db.integration.findUnique({ where: { userId_provider: { userId, provider } } });
  const granted = tokens.scopes.length ? tokens.scopes : requestedScopes;
  const scopes = Array.from(new Set([...(existing?.scopes ?? []), ...granted]));
  const data = {
    status: "CONNECTED" as const,
    externalAccountEmail: accountEmail,
    scopes,
    accessTokenEnc: encrypt(tokens.accessToken),
    // Google liefert den Refresh-Token nicht bei jeder Zustimmung erneut → vorhandenen behalten.
    refreshTokenEnc: tokens.refreshToken ? encrypt(tokens.refreshToken) : existing?.refreshTokenEnc ?? null,
    expiresAt: tokens.expiresAt ?? null,
    lastError: null,
  };
  const integration = await db.integration.upsert({
    where: { userId_provider: { userId, provider } },
    create: { userId, provider, ...data },
    update: data,
  });
  await audit({ userId, actor: "USER", action: "integration.connected", target: provider, metadata: { scopes } });
  return integration;
}

/** Liefert ein gültiges Access-Token, erneuert es bei Bedarf. */
export async function getAccessToken(userId: string, provider: IntegrationProvider, action: string): Promise<string> {
  const integration = await db.integration.findUnique({ where: { userId_provider: { userId, provider } } });
  const label = LABEL[provider];
  if (!integration || integration.status === "DISCONNECTED" || !integration.accessTokenEnc)
    throw new AppError({
      code: "INTEGRATION_NOT_CONNECTED",
      action,
      reason: `${label} ist nicht verbunden.`,
      solution: `${label} unter Einstellungen → Integrationen verbinden.`,
    });
  const fresh = integration.expiresAt && integration.expiresAt.getTime() - Date.now() > 60_000;
  if (fresh || !integration.expiresAt) return decrypt(integration.accessTokenEnc);

  const oauthProvider = OAUTH_PROVIDER[provider];
  if (!integration.refreshTokenEnc || !oauthProvider) {
    await markExpired(integration.id);
    throw expiredError(label, action);
  }
  try {
    const tokens = await refreshAccessToken(oauthProvider, decrypt(integration.refreshTokenEnc));
    await db.integration.update({
      where: { id: integration.id },
      data: {
        accessTokenEnc: encrypt(tokens.accessToken),
        refreshTokenEnc: tokens.refreshToken ? encrypt(tokens.refreshToken) : integration.refreshTokenEnc,
        expiresAt: tokens.expiresAt ?? null,
        status: "CONNECTED",
        lastError: null,
      },
    });
    return tokens.accessToken;
  } catch (err) {
    if (err instanceof AppError && err.code === "INTEGRATION_EXPIRED") {
      await markExpired(integration.id);
      throw expiredError(label, action);
    }
    throw err;
  }
}

export async function markExpired(integrationId: string) {
  await db.integration.update({
    where: { id: integrationId },
    data: { status: "EXPIRED", lastError: "OAuth-Verbindung abgelaufen" },
  });
}

export function expiredError(label: string, action: string) {
  return new AppError({
    code: "INTEGRATION_EXPIRED",
    action,
    reason: `Die ${label}-Verbindung ist abgelaufen.`,
    solution: `Bitte ${label} unter Einstellungen → Integrationen erneut verbinden.`,
  });
}

export async function requireScopes(userId: string, provider: IntegrationProvider, scopes: string[], action: string, capabilityLabel: string) {
  const integration = await db.integration.findUnique({ where: { userId_provider: { userId, provider } } });
  if (!integration || integration.status === "DISCONNECTED" || !scopes.every((s) => integration.scopes.includes(s)))
    throw new AppError({
      code: "INTEGRATION_NOT_CONNECTED",
      action,
      reason: `${capabilityLabel} ist nicht verbunden.`,
      solution: `${capabilityLabel} unter Einstellungen → Integrationen verbinden.`,
    });
  if (integration.status === "EXPIRED") throw expiredError(LABEL[provider], action);
  return integration;
}

export async function disconnectIntegration(userId: string, provider: IntegrationProvider) {
  await db.integration.updateMany({
    where: { userId, provider },
    data: { status: "DISCONNECTED", accessTokenEnc: null, refreshTokenEnc: null, configEnc: null, scopes: [] },
  });
  await audit({ userId, actor: "USER", action: "integration.disconnected", target: provider });
}
