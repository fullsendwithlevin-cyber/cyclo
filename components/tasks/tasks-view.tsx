"use client";

import { CheckSquare, LayoutList, Columns3, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorBox, SkeletonList } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { PageHeader, Tabs } from "@/components/ui/page-header";
import { useToast } from "@/components/ui/toast";
import { apiFetch, ApiError, useApi } from "@/lib/client/api";
import { fmtDateTime, relativeDays } from "@/lib/client/format";
import { cn } from "@/lib/utils";
import { PRIORITY_LABEL, STATUS_LABEL, TaskDialog, type TaskDTO } from "./task-dialog";

type Filter = "open" | "today" | "overdue" | "done" | "all";
const PRIO_TONE: Record<string, "danger" | "warning" | "primary" | "default"> = { URGENT: "danger", HIGH: "warning", MEDIUM: "primary", LOW: "default" };
const BOARD: string[] = ["INBOX", "PLANNED", "IN_PROGRESS", "WAITING", "DONE"];

export function TasksView({ projectId }: { projectId?: string }) {
  const [filter, setFilter] = useState<Filter>("open");
  const [view, setView] = useState<"list" | "board">("list");
  const status = filter === "done" ? "DONE" : filter === "all" || view === "board" ? "all" : undefined;
  const url = `/api/tasks?${new URLSearchParams({ ...(status ? { status } : {}), ...(projectId ? { projectId } : {}) })}`;
  const { data, error, isLoading, mutate } = useApi<{ tasks: TaskDTO[] }>(url);
  const [quick, setQuick] = useState("");
  const [editing, setEditing] = useState<TaskDTO | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const toast = useToast();

  const tasks = useMemo(() => {
    const now = new Date();
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);
    const all = data?.tasks ?? [];
    if (filter === "today") return all.filter((t) => t.dueDate && new Date(t.dueDate) <= endOfDay);
    if (filter === "overdue") return all.filter((t) => t.dueDate && new Date(t.dueDate) < now);
    return all;
  }, [data, filter]);

  const patch = async (t: TaskDTO, body: Record<string, unknown>, msg?: string) => {
    // Optimistisch aktualisieren, danach mit dem Server abgleichen
    void mutate((d) => d && { tasks: d.tasks.map((x) => (x.id === t.id ? { ...x, ...body } : x)) }, { revalidate: false });
    try {
      await apiFetch(`/api/tasks/${t.id}`, { method: "PATCH", body });
      if (msg) toast(msg);
      void mutate();
    } catch (e) {
      toast(e instanceof ApiError ? `${e.reason}${e.solution ? ` ${e.solution}` : ""}` : "Fehler", "error");
    }
  };

  const addQuick = async () => {
    if (!quick.trim()) return;
    try {
      await apiFetch("/api/tasks", { body: { title: quick.trim(), projectId: projectId ?? null } });
      setQuick("");
      void mutate();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  return (
    <div>
      {!projectId && (
        <PageHeader
          title="Aufgaben"
          description="Priorisiert nach Wichtigkeit und Deadline."
          actions={
            <>
              <div className="flex rounded-lg border bg-card p-0.5">
                <button onClick={() => setView("list")} className={cn("rounded-md p-1.5", view === "list" && "bg-muted")} aria-label="Listenansicht" aria-pressed={view === "list"}><LayoutList className="h-4 w-4" /></button>
                <button onClick={() => setView("board")} className={cn("rounded-md p-1.5", view === "board" && "bg-muted")} aria-label="Board-Ansicht" aria-pressed={view === "board"}><Columns3 className="h-4 w-4" /></button>
              </div>
              <Button onClick={() => (setEditing(null), setDialogOpen(true))}><Plus className="h-4 w-4" /> Aufgabe</Button>
            </>
          }
        />
      )}

      <form className="mb-4 flex gap-2" onSubmit={(e) => (e.preventDefault(), addQuick())}>
        <Input value={quick} onChange={(e) => setQuick(e.target.value)} placeholder="Schnell hinzufügen und Enter drücken …" aria-label="Neue Aufgabe" />
        {projectId && <Button type="button" variant="outline" onClick={() => (setEditing(null), setDialogOpen(true))}><Plus className="h-4 w-4" /></Button>}
      </form>

      {view === "list" && (
        <Tabs
          value={filter}
          onChange={setFilter}
          items={[
            { value: "open", label: "Offen" },
            { value: "today", label: "Heute" },
            { value: "overdue", label: "Überfällig" },
            { value: "done", label: "Erledigt" },
            { value: "all", label: "Alle" },
          ]}
        />
      )}

      <div className="mt-4">
        <ErrorBox error={error} onRetry={() => mutate()} />
        {isLoading ? (
          <SkeletonList rows={5} />
        ) : view === "board" ? (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {BOARD.map((s) => {
              const col = (data?.tasks ?? []).filter((t) => t.status === s);
              return (
                <div
                  key={s}
                  className="w-64 shrink-0 rounded-xl bg-muted/50 p-2"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    const id = e.dataTransfer.getData("text/task");
                    const t = data?.tasks.find((x) => x.id === id);
                    if (t && t.status !== s) void patch(t, { status: s });
                  }}
                >
                  <p className="mb-2 px-1 text-xs font-semibold">{STATUS_LABEL[s]} <span className="text-muted-foreground">{col.length}</span></p>
                  <div className="space-y-1.5">
                    {col.map((t) => (
                      <button
                        key={t.id}
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData("text/task", t.id)}
                        onClick={() => (setEditing(t), setDialogOpen(true))}
                        className="block w-full rounded-lg border bg-card p-2 text-left text-sm hover:border-primary/40"
                      >
                        {t.title}
                        <span className="mt-1 flex items-center gap-1.5">
                          <Badge tone={PRIO_TONE[t.priority]}>{PRIORITY_LABEL[t.priority]}</Badge>
                          {t.dueDate && <span className="text-[11px] text-muted-foreground">{relativeDays(t.dueDate)}</span>}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : !tasks.length ? (
          <EmptyState icon={<CheckSquare className="h-6 w-6" />} title={filter === "done" ? "Noch nichts erledigt" : "Keine Aufgaben"} description="Aufgaben kannst du hier, im Chat oder per Agent anlegen." />
        ) : (
          <Card className="divide-y">
            {tasks.map((t) => {
              const overdue = t.dueDate && new Date(t.dueDate) < new Date() && t.status !== "DONE";
              const blocked = t.dependsOn?.some((d) => d.status !== "DONE" && d.status !== "CANCELLED");
              return (
                <div key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                  <input
                    type="checkbox"
                    checked={t.status === "DONE"}
                    onChange={(e) => patch(t, { status: e.target.checked ? "DONE" : "PLANNED" }, e.target.checked ? "Erledigt" : undefined)}
                    className="h-4 w-4 accent-[var(--primary)]"
                    aria-label={`„${t.title}“ erledigt`}
                  />
                  <button onClick={() => (setEditing(t), setDialogOpen(true))} className="min-w-0 flex-1 text-left">
                    <span className={cn("block truncate text-sm", t.status === "DONE" && "text-muted-foreground line-through")}>{t.title}</span>
                    <span className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                      {t.project && <span>{t.project.name}</span>}
                      {t.status !== "INBOX" && t.status !== "DONE" && <span>{STATUS_LABEL[t.status]}</span>}
                      {blocked && <span className="text-warning">blockiert</span>}
                      {t.source !== "MANUAL" && <span>via {t.source === "AGENT" ? "Agent" : t.source}</span>}
                    </span>
                  </button>
                  {t.dueDate && <span className={cn("hidden text-xs sm:inline", overdue ? "text-danger" : "text-muted-foreground")} title={fmtDateTime(t.dueDate)}>{relativeDays(t.dueDate)}</span>}
                  <Badge tone={PRIO_TONE[t.priority]}>{PRIORITY_LABEL[t.priority]}</Badge>
                </div>
              );
            })}
          </Card>
        )}
      </div>

      <TaskDialog task={editing} open={dialogOpen} onClose={() => setDialogOpen(false)} onSaved={() => mutate()} defaultProjectId={projectId} />
    </div>
  );
}
