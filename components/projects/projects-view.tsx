"use client";

import { FolderKanban, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState, ErrorBox, SkeletonList } from "@/components/ui/feedback";
import { Input, Label, Textarea } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { apiFetch, ApiError, useApi } from "@/lib/client/api";
import { fmtDate } from "@/lib/client/format";

interface ProjectDTO {
  id: string;
  name: string;
  description: string | null;
  status: string;
  dueDate: string | null;
  progress: { tasksDone: number; tasksTotal: number; milestonesDone: number; milestonesTotal: number };
  _count: { tasks: number; documents: number; events: number; notes: number };
}

export const PROJECT_STATUS: Record<string, string> = { ACTIVE: "Aktiv", PAUSED: "Pausiert", DONE: "Abgeschlossen", ARCHIVED: "Archiviert" };

export function ProjectsView() {
  const { data, error, isLoading, mutate } = useApi<{ projects: ProjectDTO[] }>("/api/projects");
  const [open, setOpen] = useState(false);
  return (
    <div>
      <PageHeader title="Projekte" description="Aufgaben, Dokumente, Termine und Notizen gebündelt." actions={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Projekt</Button>} />
      <ErrorBox error={error} onRetry={() => mutate()} />
      {isLoading ? (
        <SkeletonList rows={3} />
      ) : !data?.projects.length ? (
        <EmptyState icon={<FolderKanban className="h-6 w-6" />} title="Noch keine Projekte" description="Lege ein Projekt an oder bitte den Assistenten darum." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.projects.map((p) => {
            const pct = p.progress.tasksTotal ? Math.round((p.progress.tasksDone / p.progress.tasksTotal) * 100) : 0;
            return (
              <Link key={p.id} href={`/projects/${p.id}`}>
                <Card className="h-full p-4 transition-colors hover:border-primary/40">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate font-medium">{p.name}</p>
                    <Badge tone={p.status === "ACTIVE" ? "primary" : "outline"}>{PROJECT_STATUS[p.status]}</Badge>
                  </div>
                  {p.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{p.description}</p>}
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${pct}%` }} /></div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {p.progress.tasksDone}/{p.progress.tasksTotal} Aufgaben · {p._count.documents} Dokumente · {p._count.events} Termine{p.dueDate ? ` · bis ${fmtDate(p.dueDate)}` : ""}
                  </p>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
      <ProjectDialog open={open} onClose={() => setOpen(false)} onSaved={() => mutate()} />
    </div>
  );
}

export function ProjectDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: "", description: "", dueDate: "" });
  const [error, setError] = useState<ApiError | null>(null);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await apiFetch("/api/projects", { body: { name: form.name, description: form.description || null, dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : null } });
      setForm({ name: "", description: "", dueDate: "" });
      onSaved();
      onClose();
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open={open} onClose={onClose} title="Neues Projekt" footer={<><Button variant="ghost" onClick={onClose}>Abbrechen</Button><Button onClick={save} loading={saving} disabled={!form.name.trim()}>Erstellen</Button></>}>
      <div className="space-y-3">
        <ErrorBox error={error} />
        <div><Label htmlFor="p-name">Name</Label><Input id="p-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></div>
        <div><Label htmlFor="p-desc">Beschreibung</Label><Textarea id="p-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        <div><Label htmlFor="p-due">Deadline</Label><Input id="p-due" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></div>
      </div>
    </Dialog>
  );
}
