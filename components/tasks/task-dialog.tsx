"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ErrorBox } from "@/components/ui/feedback";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { apiFetch, ApiError, useApi } from "@/lib/client/api";
import { toLocalInput } from "@/lib/client/format";

export interface TaskDTO {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  estimatedMinutes: number | null;
  projectId: string | null;
  source: string;
  project?: { id: string; name: string } | null;
  dependsOn?: { id: string; title: string; status: string }[];
}

export const STATUS_LABEL: Record<string, string> = { INBOX: "Inbox", PLANNED: "Geplant", IN_PROGRESS: "In Arbeit", WAITING: "Wartet", DONE: "Erledigt", CANCELLED: "Abgebrochen" };
export const PRIORITY_LABEL: Record<string, string> = { URGENT: "Dringend", HIGH: "Hoch", MEDIUM: "Mittel", LOW: "Niedrig" };

export function TaskDialog({ task, open, onClose, onSaved, defaultProjectId }: { task: TaskDTO | null; open: boolean; onClose: () => void; onSaved: () => void; defaultProjectId?: string }) {
  return (
    <Dialog open={open} onClose={onClose} title={task ? "Aufgabe bearbeiten" : "Neue Aufgabe"}>
      {/* Formular wird bei jedem Öffnen neu gemountet → Anfangswerte aus der Aufgabe */}
      <TaskForm task={task} onClose={onClose} onSaved={onSaved} defaultProjectId={defaultProjectId} />
    </Dialog>
  );
}

function TaskForm({ task, onClose, onSaved, defaultProjectId }: { task: TaskDTO | null; onClose: () => void; onSaved: () => void; defaultProjectId?: string }) {
  const { data: projects } = useApi<{ projects: { id: string; name: string }[] }>("/api/projects");
  const { data: allTasks } = useApi<{ tasks: TaskDTO[] }>("/api/tasks");
  const [form, setForm] = useState({
    title: task?.title ?? "",
    description: task?.description ?? "",
    status: task?.status ?? "INBOX",
    priority: task?.priority ?? "MEDIUM",
    dueDate: toLocalInput(task?.dueDate),
    estimatedMinutes: task?.estimatedMinutes ? String(task.estimatedMinutes) : "",
    projectId: task?.projectId ?? defaultProjectId ?? "",
    dependsOnIds: task?.dependsOn?.map((d) => d.id) ?? [],
  });
  const [error, setError] = useState<ApiError | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    setError(null);
    const body = {
      title: form.title,
      description: form.description || null,
      status: form.status,
      priority: form.priority,
      dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : null,
      estimatedMinutes: form.estimatedMinutes ? Number(form.estimatedMinutes) : null,
      projectId: form.projectId || null,
      dependsOnIds: form.dependsOnIds,
    };
    try {
      if (task) await apiFetch(`/api/tasks/${task.id}`, { method: "PATCH", body });
      else await apiFetch("/api/tasks", { body });
      onSaved();
      onClose();
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setSaving(false);
    }
  };

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <ErrorBox error={error} />
      <div>
        <Label htmlFor="t-title">Titel</Label>
        <Input id="t-title" value={form.title} onChange={set("title")} autoFocus />
      </div>
      <div>
        <Label htmlFor="t-desc">Beschreibung</Label>
        <Textarea id="t-desc" value={form.description} onChange={set("description")} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="t-status">Status</Label>
          <Select id="t-status" value={form.status} onChange={set("status")}>
            {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </div>
        <div>
          <Label htmlFor="t-prio">Priorität</Label>
          <Select id="t-prio" value={form.priority} onChange={set("priority")}>
            {Object.entries(PRIORITY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </div>
        <div>
          <Label htmlFor="t-due">Fällig</Label>
          <Input id="t-due" type="datetime-local" value={form.dueDate} onChange={set("dueDate")} />
        </div>
        <div>
          <Label htmlFor="t-est">Aufwand (Minuten)</Label>
          <Input id="t-est" type="number" min={1} value={form.estimatedMinutes} onChange={set("estimatedMinutes")} />
        </div>
      </div>
      <div>
        <Label htmlFor="t-proj">Projekt</Label>
        <Select id="t-proj" value={form.projectId} onChange={set("projectId")}>
          <option value="">– kein Projekt –</option>
          {projects?.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </div>
      <div>
        <Label htmlFor="t-deps">Abhängig von</Label>
        <Select
          id="t-deps"
          multiple
          className="h-24"
          value={form.dependsOnIds}
          onChange={(e) => setForm((f) => ({ ...f, dependsOnIds: Array.from(e.target.selectedOptions).map((o) => o.value) }))}
        >
          {allTasks?.tasks.filter((t) => t.id !== task?.id).map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
        </Select>
      </div>
      <div className="flex justify-end gap-2 border-t pt-3">
        <Button type="button" variant="ghost" onClick={onClose}>Abbrechen</Button>
        <Button type="submit" loading={saving} disabled={!form.title.trim()}>Speichern</Button>
      </div>
    </form>
  );
}
