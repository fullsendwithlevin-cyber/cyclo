"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch, ApiError } from "@/lib/client/api";

export function PasswordLoginForm({ returnTo, separated }: { returnTo: string; separated: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  return (
    <form
      className={separated ? "mt-6 flex flex-col gap-2 border-t pt-5" : "flex flex-col gap-2"}
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
          await apiFetch("/api/auth/password", { body: { email, password } });
          location.href = returnTo;
        } catch (err) {
          setError(err instanceof ApiError ? err.reason : "Anmeldung fehlgeschlagen");
          setLoading(false);
        }
      }}
    >
      <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-Mail" aria-label="E-Mail" autoComplete="username" required />
      <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Passwort" aria-label="Passwort" autoComplete="current-password" required />
      <Button type="submit" loading={loading}>
        Anmelden
      </Button>
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </form>
  );
}
