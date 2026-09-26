import { z } from "zod";
import { createSession } from "@/lib/auth/session";
import { upsertUserFromIdentity } from "@/lib/auth/users";
import { isDevLoginEnabled } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { api, parseBody } from "@/lib/http/api";

/**
 * Entwicklungs-Login ohne OAuth. Nur aktiv, wenn ALLOW_DEV_LOGIN=true und NODE_ENV≠production.
 * Im UI deutlich als Entwicklungsmodus gekennzeichnet.
 */
export const POST = api(
  async ({ req }) => {
    if (!isDevLoginEnabled())
      throw new AppError({ code: "FORBIDDEN", action: "Entwicklungs-Login", reason: "Der Entwicklungs-Login ist deaktiviert." });
    const { email, name } = await parseBody(req, z.object({ email: z.string().email(), name: z.string().max(100).optional() }));
    const user = await upsertUserFromIdentity("dev", { sub: email.toLowerCase(), email: email.toLowerCase(), name }, true);
    await createSession(user.id);
    return { ok: true };
  },
  { public: true, rateLimit: "auth" },
);
