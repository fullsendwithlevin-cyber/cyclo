"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ErrorBox, Notice, SkeletonList } from "@/components/ui/feedback";
import { Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { apiFetch, ApiError, useApi } from "@/lib/client/api";

interface ToolPerm {
  name: string;
  title: string;
  description: string;
  permission: string;
  scope: string;
  capability: string | null;
  override: "ALLOW" | "CONFIRM" | "DENY" | null;
  effective: "ALLOW" | "CONFIRM" | "DENY";
  reason: string;
}

const CAT: Record<string, { label: string; tone: "default" | "primary" | "warning" | "danger" }> = {
  READ: { label: "Lesen", tone: "default" },
  WRITE: { label: "Schreiben", tone: "primary" },
  DELETE: { label: "Löschen", tone: "danger" },
  SEND: { label: "Senden", tone: "danger" },
  EXTERNAL_ACTION: { label: "Externe Aktion", tone: "warning" },
  FINANCIAL: { label: "Finanziell", tone: "danger" },
  SENSITIVE: { label: "Sensibel", tone: "danger" },
};
const EFFECT = { ALLOW: "automatisch", CONFIRM: "mit Bestätigung", DENY: "gesperrt" };
const MODES = {
  SAFE: "Sicher – nur Lesen automatisch, jede Änderung bestätigen",
  ASSISTED: "Assistiert – Lesen, Aufgaben und Erinnerungen automatisch; Änderungen in externen Diensten vorschlagen",
  AUTONOMOUS: "Autonom – erlaubte Änderungen selbstständig; Senden/Löschen/externe Aktionen weiter bestätigen",
};

export function PermissionSettings() {
  const { data, error, isLoading, mutate } = useApi<{ defaultAutonomy: keyof typeof MODES; tools: ToolPerm[] }>("/api/permissions");
  const toast = useToast();
  const save = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      void mutate();
    } catch (e) {
      toast(e instanceof ApiError ? e.reason : "Fehler", "error");
    }
  };
  if (isLoading) return <SkeletonList rows={8} />;
  if (!data) return <ErrorBox error={error} onRetry={() => mutate()} />;
  const groups = new Map<string, ToolPerm[]>();
  for (const t of data.tools) {
    const g = t.name.split(".")[0];
    groups.set(g, [...(groups.get(g) ?? []), t]);
  }
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Standard-Autonomie" description="Gilt für App-interne Aktionen; externe Dienste haben ihren eigenen Modus unter Integrationen." />
        <CardBody>
          <Select value={data.defaultAutonomy} onChange={(e) => save(() => apiFetch("/api/me", { method: "PATCH", body: { settings: { defaultAutonomy: e.target.value } } }))} aria-label="Standard-Autonomie">
            {Object.entries(MODES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </CardBody>
      </Card>
      <Notice>
        Unabhängig von diesen Einstellungen gilt immer: Käufe und sensible Aktionen werden bestätigt. Hat der Agent in einem Auftrag Inhalte aus E-Mails, Webseiten oder Dokumenten gelesen, werden Senden, Löschen und externe Aktionen ebenfalls immer bestätigt (Schutz vor Prompt Injection).
      </Notice>
      {[...groups.entries()].map(([g, tools]) => (
        <Card key={g}>
          <CardHeader title={g} />
          <CardBody className="divide-y">
            {tools.map((t) => (
              <div key={t.name} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {t.title} <Badge tone={CAT[t.permission].tone}>{CAT[t.permission].label}</Badge>
                    {t.scope === "external" && <Badge tone="outline">extern</Badge>}
                  </p>
                  <p className="text-xs text-muted-foreground">Aktuell: {EFFECT[t.effective]} – {t.reason}</p>
                </div>
                <Select
                  className="sm:w-52"
                  value={t.override ?? ""}
                  onChange={(e) => save(() => apiFetch("/api/permissions", { method: "PUT", body: { toolName: t.name, decision: e.target.value || null } }))}
                  aria-label={`Berechtigung für ${t.title}`}
                >
                  <option value="">Standard (laut Modus)</option>
                  <option value="ALLOW">Immer erlauben</option>
                  <option value="CONFIRM">Immer bestätigen</option>
                  <option value="DENY">Sperren</option>
                </Select>
              </div>
            ))}
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
