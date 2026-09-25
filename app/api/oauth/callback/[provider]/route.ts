import { NextResponse, type NextRequest } from "next/server";
import { consumeOAuthFlow, exchangeCode, fetchUserInfo, type OAuthProviderId } from "@/lib/auth/oauth";
import { createSession, getSessionUser } from "@/lib/auth/session";
import { upsertUserFromIdentity } from "@/lib/auth/users";
import { saveOAuthTokens } from "@/lib/integrations/vault";
import { enqueue } from "@/lib/jobs/queue";
import { AppError, toErrorInfo } from "@/lib/errors";
import { audit } from "@/lib/observability/audit";

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const sp = req.nextUrl.searchParams;
  let purpose: "login" | "connect" = "login";
  try {
    if (provider !== "google" && provider !== "microsoft") throw new AppError({ code: "NOT_FOUND", action: "Anmeldung", reason: "Unbekannter Anbieter." });
    const flow = await consumeOAuthFlow(provider as OAuthProviderId, sp.get("state"));
    purpose = flow.purpose;
    if (sp.get("error"))
      throw new AppError({ code: "FORBIDDEN", action: "Verbindung", reason: sp.get("error") === "access_denied" ? "Zugriff wurde nicht erteilt." : `Anbieter-Fehler: ${sp.get("error")}` });
    const code = sp.get("code");
    if (!code) throw new AppError({ code: "VALIDATION", action: "Verbindung", reason: "Kein Autorisierungscode erhalten." });

    const tokens = await exchangeCode(flow.provider, code, flow.verifier);
    const info = await fetchUserInfo(flow.provider, tokens.accessToken);

    if (flow.purpose === "login") {
      const user = await upsertUserFromIdentity(flow.provider, info, flow.provider === "google");
      await createSession(user.id);
      await audit({ userId: user.id, actor: "USER", action: "auth.login", target: flow.provider, ip: req.headers.get("x-forwarded-for") });
      return NextResponse.redirect(new URL(flow.returnTo, req.url));
    }

    const user = await getSessionUser();
    if (!user) throw new AppError({ code: "UNAUTHENTICATED", action: "Verbindung", reason: "Sitzung abgelaufen.", solution: "Erneut anmelden und Verbindung wiederholen." });
    const providerEnum = flow.provider === "google" ? "GOOGLE" : "MICROSOFT";
    await saveOAuthTokens(user.id, providerEnum, tokens, info.email, flow.scopes);
    if (flow.provider === "microsoft") await enqueue("sync.onenote", { userId: user.id }, { userId: user.id });
    if (flow.scopes.some((s) => s.includes("gmail"))) await enqueue("sync.gmail", { userId: user.id }, { userId: user.id });
    const back = new URL(flow.returnTo, req.url);
    back.searchParams.set("connected", flow.provider);
    return NextResponse.redirect(back);
  } catch (err) {
    const info = toErrorInfo(err, "Verbindung");
    const target = new URL(purpose === "connect" ? "/settings" : "/login", req.url);
    target.searchParams.set("error", `${info.reason}${info.solution ? ` ${info.solution}` : ""}`);
    return NextResponse.redirect(target);
  }
}
