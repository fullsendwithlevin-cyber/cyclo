"use client";

import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, ErrorBox, SkeletonList } from "@/components/ui/feedback";
import { PageHeader, Tabs } from "@/components/ui/page-header";
import { RunSteps, StepIcon } from "@/components/agent/run-steps";
import { toolLabel } from "@/components/agent/tool-label";
import { useApi } from "@/lib/client/api";
import { fmtDateTime } from "@/lib/client/format";

interface Run {
  id: string;
  goal: string;
  trigger: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  conversationId: string | null;
  error: string | null;
  steps: { title: string; status: string }[];
  toolCalls: { id: string; toolName: string; status: string; permission: string; durationMs: number | null; error: string | null; createdAt: string }[];
}

const RUN_STATUS: Record<string, string> = { RUNNING: "läuft", AWAITING_CONFIRMATION: "wartet auf Bestätigung", COMPLETED: "abgeschlossen", FAILED: "fehlgeschlagen", CANCELLED: "abgebrochen" };

export function ActivityView() {
  const [tab, setTab] = useState<"runs" | "audit">("runs");
  const { data, error, isLoading, mutate } = useApi<{ runs: Run[] }>("/api/agent/runs?limit=50", { refreshInterval: 15_000 });
  const { data: audit } = useApi<{ audit: { id: string; actor: string; action: string; target: string | null; createdAt: string }[] }>(tab === "audit" ? "/api/activity" : null);

  return (
    <div className="space-y-4">
      <PageHeader title="Aktivität" description="Nachvollziehbar: jeder Agent-Lauf, jedes Tool, jede Berechtigung." />
      <Tabs value={tab} onChange={setTab} items={[{ value: "runs", label: "Agent-Läufe" }, { value: "audit", label: "Audit-Log" }]} />
      <ErrorBox error={error} onRetry={() => mutate()} />
      {tab === "runs" ? (
        isLoading ? (
          <SkeletonList rows={5} />
        ) : !data?.runs.length ? (
          <EmptyState title="Noch keine Agent-Läufe" />
        ) : (
          <div className="space-y-3">
            {data.runs.map((r) => (
              <Card key={r.id}>
                <CardHeader
                  title={<span className="line-clamp-2">{r.goal}</span>}
                  description={`${fmtDateTime(r.startedAt)} · ${RUN_STATUS[r.status] ?? r.status}${r.trigger !== "chat" ? ` · ${r.trigger.startsWith("automation") ? "Automation" : r.trigger}` : ""}`}
                  action={r.conversationId && <Link href={`/chat/${r.conversationId}`} className="text-xs text-primary">Unterhaltung</Link>}
                />
                <CardBody className="grid gap-4 md:grid-cols-2">
                  {r.steps.length > 0 && (
                    <div>
                      <p className="mb-1 text-xs font-medium text-muted-foreground">Plan</p>
                      <RunSteps steps={r.steps} />
                    </div>
                  )}
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Tool-Aufrufe</p>
                    {r.toolCalls.length ? (
                      <ul className="space-y-1">
                        {r.toolCalls.filter((t) => t.toolName !== "plan.update").map((t) => (
                          <li key={t.id} className="flex items-center gap-2 text-sm">
                            <StepIcon status={t.status} />
                            <span className="min-w-0 flex-1 truncate">{toolLabel(t.toolName)}</span>
                            <Badge tone="outline">{t.permission}</Badge>
                            {t.durationMs !== null && <span className="text-[11px] text-muted-foreground tabular-nums">{t.durationMs} ms</span>}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">Keine Tools verwendet.</p>
                    )}
                  </div>
                  {r.error && <ErrorBox className="md:col-span-2" error={{ code: "INTERNAL", action: "Agent-Lauf", reason: r.error }} />}
                </CardBody>
              </Card>
            ))}
          </div>
        )
      ) : (
        <Card>
          <CardHeader title="Audit-Log" icon={<ShieldCheck className="h-4 w-4" />} description="Sicherheitsrelevante Ereignisse (sensible Inhalte werden nicht protokolliert)." />
          <CardBody>
            {!audit ? (
              <SkeletonList rows={5} />
            ) : !audit.audit.length ? (
              <EmptyState title="Keine Einträge" />
            ) : (
              <ul className="divide-y text-sm">
                {audit.audit.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-2 py-2">
                    <span className="w-36 shrink-0 text-xs text-muted-foreground">{fmtDateTime(a.createdAt)}</span>
                    <Badge tone={a.action.startsWith("security") ? "danger" : "outline"}>{a.actor}</Badge>
                    <span className="font-mono text-xs">{a.action}</span>
                    {a.target && <span className="truncate text-xs text-muted-foreground">{a.target}</span>}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
