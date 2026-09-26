import { db } from "@/lib/database/prisma";
import { ensureDefaultAutomations } from "@/lib/automation/defaults";
import type { OAuthUserInfo } from "./oauth";

/** Findet oder erstellt den Benutzer zu einer Login-Identität. */
export async function upsertUserFromIdentity(provider: string, info: OAuthUserInfo, allowEmailLink: boolean) {
  const account = await db.account.findUnique({ where: { provider_providerAccountId: { provider, providerAccountId: info.sub } }, include: { user: true } });
  if (account) return account.user;
  // Verknüpfung per E-Mail nur bei verifizierten Adressen (Google), sonst Account-Übernahme möglich
  const existing = allowEmailLink ? await db.user.findUnique({ where: { email: info.email } }) : null;
  const user =
    existing ??
    (await db.user.create({ data: { email: info.email, name: info.name ?? null, image: info.picture ?? null } }));
  await db.account.create({ data: { userId: user.id, provider, providerAccountId: info.sub } });
  await ensureDefaultAutomations(user.id);
  return user;
}
