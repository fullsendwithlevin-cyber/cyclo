import { NextResponse, type NextRequest } from "next/server";
import { beginOAuthFlow } from "@/lib/auth/oauth";
import { getSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/database/prisma";
import { AppError, toErrorInfo } from "@/lib/errors";
import { getCapability } from "@/lib/integrations/catalog";

/** Startet den OAuth-Flow für eine Integration (inkrementelle Scopes). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ capability: string }> }) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.redirect(new URL("/login?returnTo=/settings", req.url));
    const { capability } = await params;
    const def = getCapability(capability);
    if (!def || def.connect !== "oauth") throw new AppError({ code: "NOT_FOUND", action: "Verbinden", reason: "Unbekannte Integration." });
    const provider = def.provider === "GOOGLE" ? "google" : "microsoft";
    const existing = await db.integration.findUnique({ where: { userId_provider: { userId: user.id, provider: def.provider } } });
    const base = provider === "google" ? ["openid", "email"] : ["openid", "email", "profile"];
    // Bereits erteilte Scopes beibehalten, damit andere Dienste desselben Anbieters verbunden bleiben
    const scopes = Array.from(new Set([...base, ...(existing?.status === "CONNECTED" ? existing.scopes : []), ...def.scopes]));
    const url = await beginOAuthFlow({ provider, scopes, purpose: "connect", returnTo: "/settings", loginHint: existing?.externalAccountEmail ?? undefined });
    return NextResponse.redirect(url);
  } catch (err) {
    const info = toErrorInfo(err, "Verbinden");
    return NextResponse.redirect(new URL(`/settings?error=${encodeURIComponent(`${info.reason} ${info.solution ?? ""}`)}`, req.url));
  }
}
