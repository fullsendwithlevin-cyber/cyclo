import { z } from "zod";
import { db } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors";
import { api, parseBody } from "@/lib/http/api";
import { getCapability } from "@/lib/integrations/catalog";
import { decrypt } from "@/lib/security/crypto";
import { disconnectIntegration } from "@/lib/integrations/vault";
import { audit } from "@/lib/observability/audit";

function capabilityOrThrow(id: string) {
  const def = getCapability(id);
  if (!def || def.connect === "server-key") throw new AppError({ code: "NOT_FOUND", action: "Integration", reason: "Unbekannte Integration." });
  return def;
}

/** Autonomie-Modus je Integration. */
export const PATCH = api<{ capability: string }>(async ({ req, user, params }) => {
  const def = capabilityOrThrow(params.capability);
  const { autonomyMode } = await parseBody(req, z.object({ autonomyMode: z.enum(["SAFE", "ASSISTED", "AUTONOMOUS"]) }));
  const res = await db.integration.updateMany({ where: { userId: user.id, provider: def.provider }, data: { autonomyMode } });
  if (!res.count) throw new AppError({ code: "INTEGRATION_NOT_CONNECTED", action: "Modus ändern", reason: `${def.label} ist nicht verbunden.` });
  await audit({ userId: user.id, actor: "USER", action: "integration.mode_changed", target: def.provider, metadata: { autonomyMode } });
  return { ok: true };
});

/** Trennt die Verbindung (bei Google: alle Google-Dienste) und widerruft das Token beim Anbieter. */
export const DELETE = api<{ capability: string }>(async ({ user, params }) => {
  const def = capabilityOrThrow(params.capability);
  const integration = await db.integration.findUnique({ where: { userId_provider: { userId: user.id, provider: def.provider } } });
  if (integration?.provider === "GOOGLE" && (integration.refreshTokenEnc || integration.accessTokenEnc)) {
    const token = decrypt(integration.refreshTokenEnc ?? integration.accessTokenEnc!);
    await fetch("https://oauth2.googleapis.com/revoke", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }) }).catch(() => undefined);
  }
  await disconnectIntegration(user.id, def.provider);
  return { ok: true };
});
