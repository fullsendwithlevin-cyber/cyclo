import { redirect } from "next/navigation";
import { Sparkles } from "lucide-react";
import { getSessionUser } from "@/lib/auth/session";
import { isOAuthProviderConfigured } from "@/lib/auth/oauth";
import { isDevLoginEnabled } from "@/lib/env";
import { DevLoginForm } from "./dev-login-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Anmelden" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; returnTo?: string }> }) {
  const sp = await searchParams;
  const returnTo = sp.returnTo?.startsWith("/") && !sp.returnTo.startsWith("//") ? sp.returnTo : "/";
  if (await getSessionUser()) redirect(returnTo);
  const google = isOAuthProviderConfigured("google");
  const dev = isDevLoginEnabled();

  return (
    <main className="flex min-h-dvh items-center justify-center bg-gradient-to-b from-accent/60 to-background px-4">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-8 shadow-xl">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Sparkles className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Chief of Staff</h1>
            <p className="text-sm text-muted-foreground">Dein persönlicher digitaler Mitarbeiter</p>
          </div>
        </div>

        {sp.error && (
          <p role="alert" className="mb-4 rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm">
            {sp.error}
          </p>
        )}

        {google ? (
          <a
            href={`/api/auth/login/google?returnTo=${encodeURIComponent(returnTo)}`}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border bg-card text-sm font-medium hover:bg-muted"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
              <path fill="#4285F4" d="M22.5 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2-1.9 3.2-4.7 3.2-8z" />
              <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.1-4.5H2.2v2.8A11 11 0 0 0 12 23z" />
              <path fill="#FBBC05" d="M5.9 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.2a11 11 0 0 0 0 9.8l3.7-2.8z" />
              <path fill="#EA4335" d="M12 5.4c1.6 0 3 .6 4.2 1.6l3.1-3.1A11 11 0 0 0 2.2 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4z" />
            </svg>
            Mit Google anmelden
          </a>
        ) : (
          <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
            Google-Anmeldung ist nicht konfiguriert (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET, siehe docs/SETUP.md).
          </p>
        )}

        {dev && <DevLoginForm returnTo={returnTo} />}
      </div>
    </main>
  );
}
