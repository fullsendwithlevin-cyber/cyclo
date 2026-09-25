"use client";

import { Card } from "@/components/ui/card";
import { EmptyState, ErrorBox, Notice, SkeletonList } from "@/components/ui/feedback";
import { Switch } from "@/components/ui/input";
import { apiFetch, useApi } from "@/lib/client/api";
import { fmtDateTime } from "@/lib/client/format";

export function AutomationSettings() {
  const { data, error, isLoading, mutate } = useApi<{ automations: { id: string; name: string; trigger: string; enabled: boolean; lastRunAt: string | null; description: string }[] }>("/api/automations");
  if (isLoading) return <SkeletonList rows={3} />;
  return (
    <div className="space-y-3">
      <ErrorBox error={error} onRetry={() => mutate()} />
      <Notice>Automationen starten einen Agent-Auftrag, wenn ein Ereignis erkannt wird. Sie laufen mit denselben Berechtigungen wie deine Chat-Aufträge – bestätigungspflichtige Aktionen landen in der Inbox.</Notice>
      {!data?.automations.length ? (
        <EmptyState title="Keine Automationen" />
      ) : (
        data.automations.map((a) => (
          <Card key={a.id} className="flex items-start gap-4 p-4">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{a.name}</p>
              <p className="text-sm text-muted-foreground">{a.description}</p>
              <p className="mt-1 text-xs text-muted-foreground">Auslöser: <code>{a.trigger}</code>{a.lastRunAt ? ` · zuletzt ${fmtDateTime(a.lastRunAt)}` : ""}</p>
            </div>
            <Switch checked={a.enabled} label={a.name} onChange={async (v) => (await apiFetch(`/api/automations/${a.id}`, { method: "PATCH", body: { enabled: v } }), mutate())} />
          </Card>
        ))
      )}
    </div>
  );
}
