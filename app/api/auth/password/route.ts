import { z } from "zod";
import { isPasswordLoginEnabled, verifyOwnerCredentials } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { upsertUserFromIdentity } from "@/lib/auth/users";
import { AppError } from "@/lib/errors";
import { api, parseBody } from "@/lib/http/api";

export const POST = api(
  async ({ req }) => {
    if (!isPasswordLoginEnabled())
      throw new AppError({
        code: "NOT_CONFIGURED",
        action: "Anmeldung mit Passwort",
        reason: "Der Passwort-Login ist nicht eingerichtet.",
        solution: "OWNER_EMAIL und OWNER_PASSWORD in der Server-Umgebung setzen.",
      });
    const { email, password } = await parseBody(req, z.object({ email: z.string().email(), password: z.string().min(1).max(200) }));
    if (!verifyOwnerCredentials(email, password))
      throw new AppError({ code: "UNAUTHENTICATED", action: "Anmeldung mit Passwort", reason: "E-Mail oder Passwort ist falsch." });
    const normalized = email.trim().toLowerCase();
    // Eigentümer ist vom Betreiber konfiguriert → Verknüpfung mit bestehendem Konto gleicher E-Mail erlaubt
    const user = await upsertUserFromIdentity("password", { sub: normalized, email: normalized }, true);
    await createSession(user.id);
    return { ok: true };
  },
  { public: true, rateLimit: "auth" },
);
