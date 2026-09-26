import { cookies, headers } from "next/headers";
import { db } from "@/lib/database/prisma";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { randomToken, sha256 } from "@/lib/security/crypto";

const SESSION_DAYS = 30;

export function sessionCookieName() {
  return env().NODE_ENV === "production" ? "__Host-cos_session" : "cos_session";
}

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  timezone: string;
  locale: string;
}

export async function createSession(userId: string): Promise<void> {
  const token = randomToken(32);
  const h = await headers();
  await db.session.create({
    data: {
      userId,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + SESSION_DAYS * 864e5),
      userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
      ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    },
  });
  const jar = await cookies();
  jar.set(sessionCookieName(), token, {
    httpOnly: true,
    secure: env().NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(sessionCookieName())?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date()) return null;
  const { id, email, name, image, timezone, locale } = session.user;
  return { id, email, name, image, timezone, locale };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user)
    throw new AppError({
      code: "UNAUTHENTICATED",
      action: "Anfrage",
      reason: "Nicht angemeldet.",
      solution: "Bitte anmelden.",
    });
  return user;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(sessionCookieName())?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: sha256(token) } });
  jar.delete(sessionCookieName());
}
