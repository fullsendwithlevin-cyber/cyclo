"use client";

import {
  Activity,
  AlertTriangle,
  ArrowUp,
  BookOpen,
  CalendarDays,
  CheckSquare,
  FileText,
  FolderKanban,
  GraduationCap,
  Inbox,
  Mail,
  Plug,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorBox, Notice, Skeleton, SkeletonList } from "@/components/ui/feedback";
import { RunSteps, StepIcon } from "@/components/agent/run-steps";
import { apiFetch, useApi } from "@/lib/client/api";
import { fmtDate, fmtDateTime, fmtLongDate, fmtTime, relativeDays } from "@/lib/client/format";
import { useToast } from "@/components/ui/toast";
import { Section } from "./section";
import { ToolLabel } from "@/components/agent/tool-label";
import type { ErrorInfo } from "@/lib/errors";

interface DashboardData {
  today: { events: { id: string; title: string; start: string; end: string; allDay: boolean; location?: string | null; kind: string; status: string; source: string }[]; googleConnected: boolean; warnings: ErrorInfo[] };
  tasks: { id: string; title: string; priority: string; dueDate: string | null; status: string; project: { name: string } | null }[];
  taskCounts: { open: number; overdue: number };
  exams: { id: string; subject: string; title: string; start: string; topics: string[]; study: { total: number; done: number } }[];
  projects: { id: string; name: string; progress: { tasksDone: number; tasksTotal: number } }[];
  documents: { id: string; title: string; source: string; status: string; createdAt: string }[];
  inbox: { notifications: { id: string; title: string; body: string; priority: string; link: string | null; createdAt: string }[]; emails: { id: string; title: string; author: string | null; externalId: string; metadata: { threadId?: string; reason?: string } }[] };
  activity: { id: string; goal: string; status: string; trigger: string; startedAt: string; conversationId: string | null; steps: { title: string; status: string }[]; toolCalls: { toolName: string; status: string }[] }[];
  pending: { id: string; toolName: string; createdAt: string; run: { conversationId: string | null; goal: string } }[];
  setup: { aiConfigured: boolean; capabilities: { id: string; label: string; connected: boolean; status: string }[] };
}

const PRIO_TONE: Record<string, "danger" | "warning" | "primary" | "default"> = { URGENT: "danger", HIGH: "warning", MEDIUM: "primary", LOW: "default" };
const PRIO_LABEL: Record<string, string> = { URGENT: "Dringend", HIGH: "Hoch", MEDIUM: "Mittel", LOW: "Niedrig" };

function greeting() {
  const h = new Date().getHours();
  return h < 11 ? "Guten Morgen" : h < 17 ? "Guten Tag" : "Guten Abend";
}

export function Dashboard() {
  const { data, error, isLoading, mutate } = useApi<DashboardData>("/api/dashboard", { refreshInterval: 60_000 });
  const router = useRouter();
  const toast = useToast();
  const [ask, setAsk] = useState("");

  const completeTask = async (id: string) => {
    try {
      await apiFetch(`/api/tasks/${id}`, { method: "PATCH", body: { status: "DONE" } });
      toast("Aufgabe erledigt");
      void mutate();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{fmtLongDate(new Date())}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{greeting()}</h1>
        </div>
        <form
          className="flex w-full items-center gap-2 rounded-xl border bg-card p-1.5 pl-3 shadow-sm md:max-w-md"
          onSubmit={(e) => {
            e.preventDefault();
            if (ask.trim()) router.push(`/chat?q=${encodeURIComponent(ask.trim())}`);
          }}
        >
          <input value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="„Organisiere meine nächste Prüfung“" className="h-8 flex-1 bg-transparent text-sm outline-none" aria-label="Auftrag an den Assistenten" />
          <Button size="icon" className="h-8 w-8" aria-label="Senden" disabled={!ask.trim()}>
            <ArrowUp className="h-4 w-4" />
          </Button>
        </form>
      </div>

      <ErrorBox error={error} onRetry={() => mutate()} />

      {data && !data.setup.aiConfigured && (
        <Notice tone="warning">
          <b>KI-Provider nicht konfiguriert.</b> Chat und Agent sind erst nutzbar, wenn <code>ANTHROPIC_API_KEY</code> oder <code>OPENAI_API_KEY</code> gesetzt ist. Kalender, Aufgaben, Prüfungen und Dokumente funktionieren auch ohne.
        </Notice>
      )}

      {data && data.pending.length > 0 && (
        <div className="rounded-xl border border-warning/40 bg-warning/10 p-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            <AlertTriangle className="h-4 w-4 text-warning" /> {data.pending.length} Aktion(en) warten auf deine Bestätigung
          </p>
          <ul className="mt-2 space-y-1">
            {data.pending.slice(0, 4).map((p) => (
              <li key={p.id} className="text-sm">
                <Link href={p.run.conversationId ? `/chat/${p.run.conversationId}` : "/activity"} className="underline-offset-2 hover:underline">
                  <ToolLabel name={p.toolName} /> – {p.run.goal.slice(0, 80)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="Heute" icon={<CalendarDays className="h-4 w-4" />} href="/calendar" className="lg:col-span-2">
          {isLoading ? (
            <SkeletonList rows={3} />
          ) : !data?.today.events.length ? (
            <EmptyState title="Keine Termine heute" description={data?.today.googleConnected ? undefined : "Google Calendar ist nicht verbunden – nur App-Termine werden angezeigt."} />
          ) : (
            <ul className="divide-y">
              {data.today.events.map((e) => (
                <li key={e.id} className="flex items-center gap-3 py-2">
                  <span className="w-20 shrink-0 font-mono text-xs text-muted-foreground tabular-nums">{e.allDay ? "ganztägig" : `${fmtTime(e.start)}–${fmtTime(e.end)}`}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{e.title}</span>
                  {e.kind === "EXAM" && <Badge tone="danger">Prüfung</Badge>}
                  {e.kind === "STUDY_BLOCK" && <Badge tone="primary">Lernen</Badge>}
                  {e.status === "PROPOSED" && <Badge tone="warning">Vorschlag</Badge>}
                </li>
              ))}
            </ul>
          )}
          {data?.today.warnings.map((w, i) => <ErrorBox key={i} error={w} className="mt-3" />)}
        </Section>

        <Section title="Inbox" icon={<Inbox className="h-4 w-4" />} href="/inbox">
          {isLoading ? (
            <SkeletonList rows={3} />
          ) : !data?.inbox.notifications.length && !data?.inbox.emails.length ? (
            <EmptyState title="Alles gesichtet" description="Neue relevante Informationen erscheinen hier." />
          ) : (
            <ul className="space-y-2">
              {data.inbox.notifications.slice(0, 4).map((n) => (
                <li key={n.id}>
                  <Link href={n.link ?? "/inbox"} className="block rounded-lg p-2 hover:bg-muted">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      {(n.priority === "CRITICAL" || n.priority === "IMPORTANT") && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                      <span className="truncate">{n.title}</span>
                    </p>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
                  </Link>
                </li>
              ))}
              {data.inbox.emails.slice(0, 3).map((m) => (
                <li key={m.id} className="flex items-start gap-2 p-2">
                  <Mail className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="truncate text-sm">{m.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{m.author}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Aufgaben" icon={<CheckSquare className="h-4 w-4" />} href="/tasks" className="lg:col-span-2">
          {isLoading ? (
            <SkeletonList rows={4} />
          ) : !data?.tasks.length ? (
            <EmptyState title="Keine offenen Aufgaben" action={<Link href="/tasks" className="text-sm text-primary">Aufgabe anlegen</Link>} />
          ) : (
            <>
              {data.taskCounts.overdue > 0 && <p className="mb-2 text-xs text-danger">{data.taskCounts.overdue} überfällig</p>}
              <ul className="divide-y">
                {data.tasks.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 py-2">
                    <button onClick={() => completeTask(t.id)} className="h-4 w-4 shrink-0 rounded border hover:border-primary" aria-label={`„${t.title}“ erledigen`} />
                    <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
                    {t.project && <span className="hidden truncate text-xs text-muted-foreground sm:inline">{t.project.name}</span>}
                    {t.dueDate && <span className={`text-xs ${new Date(t.dueDate) < new Date() ? "text-danger" : "text-muted-foreground"}`}>{relativeDays(t.dueDate)}</span>}
                    <Badge tone={PRIO_TONE[t.priority]}>{PRIO_LABEL[t.priority]}</Badge>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Section>

        <Section title="Prüfungen" icon={<GraduationCap className="h-4 w-4" />} href="/exams">
          {isLoading ? (
            <SkeletonList rows={2} />
          ) : !data?.exams.length ? (
            <EmptyState title="Keine anstehenden Prüfungen" description="Prüfungen aus der Schulplattform oder per Chat erscheinen hier." />
          ) : (
            <ul className="space-y-3">
              {data.exams.map((e) => (
                <li key={e.id}>
                  <Link href={`/exams/${e.id}`} className="block rounded-lg p-2 hover:bg-muted">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium">{e.subject}</p>
                      <Badge tone={(new Date(e.start).getTime() - Date.now()) / 864e5 < 4 ? "danger" : "outline"}>{relativeDays(e.start)}</Badge>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{e.title} · {fmtDateTime(e.start)}</p>
                    <div className="mt-2 flex items-center gap-2" title="Lernfortschritt">
                      <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${e.study.total ? (e.study.done / e.study.total) * 100 : 0}%` }} />
                      </div>
                      <span className="text-[11px] text-muted-foreground tabular-nums">{e.study.total ? `${e.study.done}/${e.study.total}` : "kein Plan"}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Agent-Aktivität" icon={<Activity className="h-4 w-4" />} href="/activity" className="lg:col-span-2">
          {isLoading ? (
            <SkeletonList rows={3} />
          ) : !data?.activity.length ? (
            <EmptyState title="Noch keine Agent-Aktivität" description="Gib dem Assistenten einen Auftrag – hier siehst du, was er getan hat." />
          ) : (
            <ul className="space-y-3">
              {data.activity.map((r) => (
                <li key={r.id} className="rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <StepIcon status={r.status === "COMPLETED" ? "DONE" : r.status === "AWAITING_CONFIRMATION" ? "WAITING" : r.status} />
                    <Link href={r.conversationId ? `/chat/${r.conversationId}` : "/activity"} className="min-w-0 flex-1 truncate text-sm font-medium hover:underline">
                      {r.goal}
                    </Link>
                    {r.trigger.startsWith("automation") && <Badge tone="primary">automatisch</Badge>}
                    <span className="text-[11px] text-muted-foreground">{fmtDate(r.startedAt)}</span>
                  </div>
                  {r.steps.length ? (
                    <RunSteps steps={r.steps} className="mt-2 pl-5" />
                  ) : (
                    <ul className="mt-2 space-y-1 pl-5">
                      {r.toolCalls.slice(0, 6).map((t, i) => (
                        <li key={i} className="flex items-center gap-2 text-sm">
                          <StepIcon status={t.status} /> <ToolLabel name={t.toolName} />
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <div className="space-y-4">
          <Section title="Projekte" icon={<FolderKanban className="h-4 w-4" />} href="/projects">
            {isLoading ? (
              <Skeleton className="h-16" />
            ) : !data?.projects.length ? (
              <EmptyState title="Keine aktiven Projekte" />
            ) : (
              <ul className="space-y-2">
                {data.projects.map((p) => (
                  <li key={p.id}>
                    <Link href={`/projects/${p.id}`} className="block rounded-lg p-1.5 hover:bg-muted">
                      <div className="flex justify-between text-sm">
                        <span className="truncate">{p.name}</span>
                        <span className="text-xs text-muted-foreground tabular-nums">{p.progress.tasksDone}/{p.progress.tasksTotal}</span>
                      </div>
                      <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full bg-primary" style={{ width: `${p.progress.tasksTotal ? (p.progress.tasksDone / p.progress.tasksTotal) * 100 : 0}%` }} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Dokumente" icon={<FileText className="h-4 w-4" />} href="/documents">
            {isLoading ? (
              <Skeleton className="h-16" />
            ) : !data?.documents.length ? (
              <EmptyState title="Noch keine Dokumente" />
            ) : (
              <ul className="space-y-1">
                {data.documents.map((d) => (
                  <li key={d.id}>
                    <Link href={`/documents/${d.id}`} className="flex items-center gap-2 rounded-lg p-1.5 text-sm hover:bg-muted">
                      <span className="min-w-0 flex-1 truncate">{d.title}</span>
                      {d.status !== "INDEXED" && <Badge tone={d.status === "FAILED" ? "danger" : "default"}>{d.status === "FAILED" ? "Fehler" : "in Arbeit"}</Badge>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {data && data.setup.capabilities.some((c) => !c.connected) && (
            <Section title="Verbindungen" icon={<Plug className="h-4 w-4" />} href="/settings">
              <ul className="space-y-1 text-sm">
                {data.setup.capabilities.map((c) => (
                  <li key={c.id} className="flex items-center justify-between">
                    <span className="text-muted-foreground">{c.label}</span>
                    <Badge tone={c.connected ? "success" : c.status === "EXPIRED" || c.status === "ERROR" ? "danger" : "outline"}>
                      {c.connected ? "verbunden" : c.status === "EXPIRED" ? "abgelaufen" : c.status === "ERROR" ? "Fehler" : c.status === "NOT_CONFIGURED" ? "nicht konfiguriert" : "nicht verbunden"}
                    </Badge>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}
