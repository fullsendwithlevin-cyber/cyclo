import { createHash, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/**
 * Passwort-Login für den Eigentümer (Self-Hosting ohne Google). Zugangsdaten stehen nur in der
 * Server-Umgebung (OWNER_EMAIL / OWNER_PASSWORD); verglichen wird zeitkonstant.
 */
export const isPasswordLoginEnabled = () => Boolean(env().OWNER_EMAIL && env().OWNER_PASSWORD);

const digest = (s: string) => createHash("sha256").update(s, "utf8").digest();

export function verifyOwnerCredentials(email: string, password: string): boolean {
  const { OWNER_EMAIL, OWNER_PASSWORD } = env();
  if (!OWNER_EMAIL || !OWNER_PASSWORD) return false;
  const emailOk = timingSafeEqual(digest(email.trim().toLowerCase()), digest(OWNER_EMAIL.trim().toLowerCase()));
  const passwordOk = timingSafeEqual(digest(password), digest(OWNER_PASSWORD));
  return emailOk && passwordOk;
}
