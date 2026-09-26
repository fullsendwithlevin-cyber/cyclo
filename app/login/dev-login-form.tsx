"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch, ApiError } from "@/lib/client/api";

export function DevLoginForm({ returnTo }: { returnTo: string }) {
  const [email, setEmail] = useState("dev@example.com");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  return (
    <form
      className="mt-6 border-t pt-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
          await apiFetch("/api/auth/dev-login", { body: { email } });
          location.href = returnTo;
        } catch (err) {
          setError(err instanceof ApiError ? err.reason : "Anmeldung fehlgeschlagen");
          setLoading(false);
        }
      }}
    >
      <p className="mb-2 text-xs font-medium text-warning">Entwicklungsmodus – Login ohne OAuth</p>
      <div className="flex gap-2">
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="E-Mail" required />
        <Button type="submit" variant="secondary" loading={loading}>
          Weiter
        </Button>
      </div>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </form>
  );
}
