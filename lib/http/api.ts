import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { getSessionUser, type SessionUser } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { AppError, toErrorInfo } from "@/lib/errors";
import { logger } from "@/lib/observability/audit";
import { checkRateLimit, RATE_LIMITS, type RateLimitRule } from "./rate-limit";

type Params = Record<string, string | string[]>;

export interface ApiContext<P extends Params = Params> {
  req: NextRequest;
  user: SessionUser;
  params: P;
}

interface Options {
  rateLimit?: keyof typeof RATE_LIMITS | RateLimitRule;
  /** Ohne Login erreichbar (z. B. Login-Routen). */
  public?: boolean;
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** CSRF-Schutz: Mutationen nur von der eigenen Origin (zusätzlich zu SameSite-Cookies). */
export function isSameOrigin(req: Request): boolean {
  if (!MUTATING.has(req.method)) return true;
  const origin = req.headers.get("origin");
  if (origin) {
    const allowed = new URL(env().APP_URL).origin;
    const host = req.headers.get("host");
    return origin === allowed || (host !== null && new URL(origin).host === host);
  }
  return req.headers.get("sec-fetch-site") === "same-origin";
}

export function errorResponse(err: unknown, action = "Anfrage") {
  if (err instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION",
          action,
          reason: err.issues.map((i) => `${i.path.join(".") || "Eingabe"}: ${i.message}`).join("; "),
          solution: "Eingaben prüfen.",
        },
      },
      { status: 400 },
    );
  }
  const info = toErrorInfo(err, action);
  const status = err instanceof AppError ? err.httpStatus : 500;
  if (status >= 500) logger.error("api.error", { action, reason: info.reason });
  return NextResponse.json({ error: info }, { status });
}

export function api<P extends Params = Params>(
  handler: (ctx: ApiContext<P>) => Promise<Response | unknown>,
  opts: Options = {},
) {
  return async (req: NextRequest, routeCtx: { params: Promise<P> }) => {
    try {
      if (!isSameOrigin(req))
        throw new AppError({ code: "FORBIDDEN", action: "Anfrage", reason: "Ungültige Herkunft (CSRF-Schutz)." });
      const user = await getSessionUser();
      if (!user && !opts.public)
        throw new AppError({ code: "UNAUTHENTICATED", action: "Anfrage", reason: "Nicht angemeldet.", solution: "Bitte anmelden." });
      const rule = typeof opts.rateLimit === "object" ? opts.rateLimit : RATE_LIMITS[opts.rateLimit ?? "default"];
      const key = `${user?.id ?? req.headers.get("x-forwarded-for") ?? "anon"}:${new URL(req.url).pathname}`;
      const rl = checkRateLimit(key, rule);
      if (!rl.ok) {
        return NextResponse.json(
          { error: { code: "RATE_LIMITED", action: "Anfrage", reason: "Zu viele Anfragen.", solution: `In ${rl.retryAfterSec} s erneut versuchen.` } },
          { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } },
        );
      }
      const params = (await routeCtx?.params) ?? ({} as P);
      const result = await handler({ req, user: user as SessionUser, params });
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new AppError({ code: "VALIDATION", action: "Anfrage", reason: "Ungültiges JSON." });
  }
  return schema.parse(json);
}

export function parseQuery<T>(req: NextRequest, schema: ZodType<T>): T {
  return schema.parse(Object.fromEntries(req.nextUrl.searchParams.entries()));
}
