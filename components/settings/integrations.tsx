"use client";

import { CalendarDays, Globe, HardDrive, Link2, Mail, NotebookPen, RefreshCw, School, Unplug } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorBox, Notice, SkeletonList } from "@/components/ui/feedback";
import { Input, Label, Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { apiFetch, ApiError, useApi } from "@/lib/client/api";
import { fmtDateTime } from "@/lib/client/format";

interface Integration {
  id: string;
  label: string;
  description: string;
  connected: boolean;
  status: string;
  autonomyMode: "SAFE" | "ASSISTED" | "AUTONOMOUS";
  account?: string | null;
  lastSyncAt?: string | null;
  lastError?: string | null;
  connect: "oauth" | "ics-url" | "server-key";
  provider: string;
  serverConfigured: boolean;
}

const ICONS: Record<string, React.ReactNode> = {
  "google-calendar": <CalendarDays className="h-5 w-5" />,
  gmail: <Mail className="h-5 w-5" />,
  "google-drive": <HardDrive className="h-5 w-5" />,
  onenote: <NotebookPen className="h-5 w-5" />,
  school: <School className="h-5 w-5" />,
  "web-search": <Globe className="h-5 w-5" />,
};

const MODES = { SAFE: "Sicher – alles bestätigen", ASSISTED: "Assistiert – Vorschläge", AUTONOMOUS: "Autonom – erlaubte Aktionen selbst" } as const;
const SYNCABLE = new Set(["gmail", "onenote", "school"]);

export function IntegrationSettings() {
  const { data, error, isLoading, mutate } = useApi<{ integrations: Integration[] }>("/api/integrations");
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (id: string, fn: () => Promise<unknown>, msg: string) => {
    setBusy(id);
    try {
      await fn();
      toast(msg);
      void mutate();
    } catch (e) {
      toast(e instanceof ApiError ? `${e.reason}${e.solution ? ` ${e.solution}` : ""}` : "Fehler", "error");
    } finally {
      setBusy(null);
    }
  };

  if (isLoading) return <SkeletonList rows={5} />;
  return (
    <div className="space-y-3">
      <ErrorBox error={error} onRetry={() => mutate()} />
      <Notice>
        Tokens werden verschlüsselt gespeichert. Nicht verbundene Dienste werden nie simuliert – der Assistent sagt dir, was fehlt. Bei Google gelten Kalender, Gmail und Drive als ein Konto: „Trennen“ trennt alle Google-Dienste.
      </Notice>
      {data?.integrations.map((i) => (
        <Card key={i.id} className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">{ICONS[i.id]}</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{i.label}</p>
                <Badge tone={i.connected ? "success" : i.status === "EXPIRED" || i.status === "ERROR" ? "danger" : "outline"}>
                  {i.connected ? "verbunden" : i.status === "EXPIRED" ? "abgelaufen" : i.status === "ERROR" ? "Fehler" : i.status === "NOT_CONFIGURED" ? "nicht konfiguriert" : "nicht verbunden"}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{i.description}</p>
              {i.account && <p className="mt-1 text-xs text-muted-foreground">Konto: {i.account}</p>}
              {i.lastSyncAt && <p className="text-xs text-muted-foreground">Letzter Abgleich: {fmtDateTime(i.lastSyncAt)}</p>}
              {i.lastError && <p className="text-xs text-danger">{i.lastError}</p>}
              {!i.serverConfigured && i.connect === "oauth" && (
                <p className="mt-1 text-xs text-warning">Auf dem Server fehlen die OAuth-Zugangsdaten ({i.provider === "GOOGLE" ? "GOOGLE_CLIENT_ID/SECRET" : "MICROSOFT_CLIENT_ID/SECRET"}).</p>
              )}
              {i.connect === "server-key" && !i.connected && <p className="mt-1 text-xs text-warning">Wird über BRAVE_SEARCH_API_KEY auf dem Server aktiviert.</p>}
              {i.connected && i.connect !== "server-key" && (
                <div className="mt-3 max-w-xs">
                  <Label htmlFor={`mode-${i.id}`}>Autonomie-Modus</Label>
                  <Select id={`mode-${i.id}`} value={i.autonomyMode} onChange={(e) => run(i.id, () => apiFetch(`/api/integrations/${i.id}`, { method: "PATCH", body: { autonomyMode: e.target.value } }), "Modus gespeichert")}>
                    {Object.entries(MODES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </Select>
                </div>
              )}
              {i.id === "school" && !i.connected && <SchoolForm onDone={() => mutate()} />}
            </div>
            <div className="flex flex-wrap gap-2 sm:flex-col">
              {i.connect === "oauth" && i.serverConfigured && (!i.connected || i.status === "EXPIRED") && (
                <a href={`/api/integrations/connect/${i.id}`} className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">
                  <Link2 className="h-4 w-4" /> {i.status === "EXPIRED" ? "Erneut verbinden" : "Verbinden"}
                </a>
              )}
              {i.connected && SYNCABLE.has(i.id) && (
                <Button variant="outline" size="sm" loading={busy === `sync-${i.id}`} onClick={() => run(`sync-${i.id}`, () => apiFetch(`/api/integrations/${i.id}/sync`, { method: "POST" }), "Abgleich abgeschlossen")}>
                  <RefreshCw className="h-4 w-4" /> Jetzt abgleichen
                </Button>
              )}
              {(i.connected || i.status === "EXPIRED" || i.status === "ERROR") && i.connect !== "server-key" && (
                <Button variant="ghost" size="sm" loading={busy === i.id} onClick={() => confirm(`${i.label} trennen?`) && run(i.id, () => apiFetch(`/api/integrations/${i.id}`, { method: "DELETE" }), "Verbindung getrennt")}>
                  <Unplug className="h-4 w-4" /> Trennen
                </Button>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function SchoolForm({ onDone }: { onDone: () => void }) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("ADING");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const toast = useToast();
  return (
    <form
      className="mt-3 space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          const res = await apiFetch<{ sync: { newExams: number; events: number } }>("/api/integrations/school", { body: { icsUrl: url, platformName: name } });
          toast(`Verbunden: ${res.sync.newExams} Prüfungen, ${res.sync.events} Termine importiert`);
          onDone();
        } catch (err) {
          setError(err as ApiError);
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="text-xs text-muted-foreground">
        Hinterlege den offiziellen Kalender-Export (iCal/ICS-Abo-Link) deiner Schulplattform. Es werden keine Passwörter gespeichert und kein Login automatisiert. Eine offizielle ADING-API ist nicht verifiziert – falls ADING keinen ICS-Export anbietet, ist diese Integration dort nicht möglich.
      </p>
      <div className="grid gap-2 sm:grid-cols-[1fr_140px_auto]">
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…/kalender.ics oder webcal://…" aria-label="ICS-URL" required />
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Plattform" aria-label="Name der Plattform" />
        <Button loading={busy} disabled={url.length < 8}>Verbinden</Button>
      </div>
      <ErrorBox error={error} />
    </form>
  );
}
