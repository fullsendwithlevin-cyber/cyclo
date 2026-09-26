import { NextResponse, type NextRequest } from "next/server";

/**
 * Läuft vor jeder Seite: setzt eine CSP mit Nonce und leitet nicht angemeldete Benutzer zum Login.
 * (Die eigentliche Session-Prüfung passiert serverseitig in jeder Route; hier nur der Cookie-Check.)
 */
const PUBLIC_PATHS = ["/login"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isProd = process.env.NODE_ENV === "production";
  const cookieName = isProd ? "__Host-cos_session" : "cos_session";
  if (!PUBLIC_PATHS.some((p) => pathname.startsWith(p)) && !request.cookies.get(cookieName)) {
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("returnTo", pathname + search);
    return NextResponse.redirect(url);
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isProd ? "" : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data: https://*.googleusercontent.com",
    "font-src 'self'",
    "connect-src 'self'",
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isProd ? ["upgrade-insecure-requests"] : []),
  ].join("; ");

  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|sw.js).*)",
      missing: [{ type: "header", key: "next-router-prefetch" }, { type: "header", key: "purpose", value: "prefetch" }],
    },
  ],
};
