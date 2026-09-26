import { NextResponse, type NextRequest } from "next/server";
import { beginOAuthFlow } from "@/lib/auth/oauth";
import { errorResponse } from "@/lib/http/api";
import { checkRateLimit, RATE_LIMITS } from "@/lib/http/rate-limit";
import { AppError } from "@/lib/errors";

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  try {
    const { provider } = await params;
    if (provider !== "google") throw new AppError({ code: "NOT_FOUND", action: "Anmeldung", reason: "Unbekannter Anbieter." });
    const rl = checkRateLimit(`login:${req.headers.get("x-forwarded-for") ?? "local"}`, RATE_LIMITS.auth);
    if (!rl.ok) throw new AppError({ code: "RATE_LIMITED", action: "Anmeldung", reason: "Zu viele Versuche.", solution: `In ${rl.retryAfterSec} s erneut versuchen.` });
    const url = await beginOAuthFlow({
      provider: "google",
      scopes: ["openid", "email", "profile"],
      purpose: "login",
      returnTo: req.nextUrl.searchParams.get("returnTo") ?? "/",
    });
    return NextResponse.redirect(url);
  } catch (err) {
    if (err instanceof AppError) return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(err.reason)}`, req.url));
    return errorResponse(err, "Anmeldung");
  }
}
