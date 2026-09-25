"use client";

import { ArrowLeft, Flag, Plus, StickyNote, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, ErrorBox, SkeletonList } from "@/components/ui/feedback";
import { Input, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { TasksView } from "@/components/tasks/tasks-view";
import { apiFetch, ApiError, useApi } from "@/lib/client/api";
import { fmtDate, fmtDateTime } from "@/lib/client/format";
import { PROJECT_STATUS } from "./projects-view";

interface ProjectFull {
  id: string;
  name: string;
  description: string | null;
  status: string;
  dueDate: string | null;
  milestones: { id: string; title: string; dueDate: string | null; done: boolean }[];
  documents: { id: string; title: string; status: string }[];
  events: { id: string; title: string; start: string }[];
  notes: { id: string; title: string; content: string; updatedAt: string }[];
  exams: { id: string; subject: string; start: string }[];
  conversations: { id: string; title: string }[];
}

export function ProjectDetail({ id }: { id: string }) {
  const { data, error, isLoading, mutate } = useApi<{ project: ProjectFull }>(`/api/projects/${id}`);
  const [milestone, setMilestone] = useState("");
  const [note, setNote] = useState({ title: "", content: "" });
  const toast = useToast();
  const router = useRouter();

  if (isLoading) return <SkeletonList rows={6} />;
  if (error || !data) return <ErrorBox error={error} onRetry={() => mutate()} />;
  const p = data.project;

  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      void mutate();
    } catch (e) {
      toast(e instanceof ApiError ? e.reason : "Fehler", "error");
    }
  };

  return (
    <div className="space-y-4">
      <Link href="/projects" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Projekte</Link>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{p.name}</h1>
          {p.description && <p className="text-sm text-muted-foreground">{p.description}</p>}
          {p.dueDate && <p className="text-xs text-muted-foreground">Deadline {fmtDate(p.dueDate)}</p>}
        </div>
        <div className="flex gap-2">
          <Select value={p.status} onChange={(e) => act(() => apiFetch(`/api/projects/${id}`, { method: "PATCH", body: { status: e.target.value } }))} aria-label="Status" className="w-40">
            {Object.entries(PROJECT_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
          <Button variant="ghost" aria-label="Projekt löschen" onClick={async () => { if (confirm("Projekt löschen? Aufgaben bleiben erhalten.")) { await apiFetch(`/api/projects/${id}`, { method: "DELETE" }); router.push("/projects"); } }}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Aufgaben" />
          <CardBody><TasksView projectId={id} /></CardBody>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Meilensteine" icon={<Flag className="h-4 w-4" />} />
            <CardBody className="space-y-2">
              {p.milestones.map((m) => (
                <label key={m.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={m.done} onChange={(e) => act(() => apiFetch(`/api/milestones/${m.id}`, { method: "PATCH", body: { done: e.target.checked } }))} />
                  <span className={m.done ? "text-muted-foreground line-through" : ""}>{m.title}</span>
                  {m.dueDate && <span className="ml-auto text-xs text-muted-foreground">{fmtDate(m.dueDate)}</span>}
                </label>
              ))}
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (milestone.trim()) act(() => apiFetch(`/api/projects/${id}/milestones`, { body: { title: milestone } })).then(() => setMilestone("")); }}>
                <Input value={milestone} onChange={(e) => setMilestone(e.target.value)} placeholder="Neuer Meilenstein" aria-label="Neuer Meilenstein" />
                <Button size="icon" variant="outline" aria-label="Hinzufügen"><Plus className="h-4 w-4" /></Button>
              </form>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Termine & Prüfungen" />
            <CardBody className="space-y-1 text-sm">
              {!p.events.length && !p.exams.length && <p className="text-muted-foreground">Keine verknüpften Termine.</p>}
              {p.exams.map((x) => <Link key={x.id} href={`/exams/${x.id}`} className="block hover:underline">🎓 {x.subject} · {fmtDateTime(x.start)}</Link>)}
              {p.events.map((ev) => <p key={ev.id}>{fmtDateTime(ev.start)} · {ev.title}</p>)}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Dokumente" />
            <CardBody className="space-y-1 text-sm">
              {p.documents.length ? p.documents.map((d) => <Link key={d.id} href={`/documents/${d.id}`} className="block truncate hover:underline">{d.title}</Link>) : <p className="text-muted-foreground">Keine Dokumente. Beim Hochladen kann ein Projekt gewählt werden.</p>}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Notizen" icon={<StickyNote className="h-4 w-4" />} />
            <CardBody className="space-y-2">
              {p.notes.map((n) => (
                <details key={n.id} className="rounded-lg border p-2 text-sm">
                  <summary className="cursor-pointer font-medium">{n.title}</summary>
                  <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{n.content}</p>
                  <button className="mt-1 text-xs text-danger" onClick={() => act(() => apiFetch(`/api/notes/${n.id}`, { method: "DELETE" }))}>Löschen</button>
                </details>
              ))}
              {!p.notes.length && <EmptyState title="Keine Notizen" className="py-4" />}
              <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (note.title.trim()) act(() => apiFetch("/api/notes", { body: { ...note, projectId: id } })).then(() => setNote({ title: "", content: "" })); }}>
                <Input value={note.title} onChange={(e) => setNote({ ...note, title: e.target.value })} placeholder="Titel" aria-label="Notiztitel" />
                <Textarea value={note.content} onChange={(e) => setNote({ ...note, content: e.target.value })} placeholder="Notiz …" aria-label="Notizinhalt" />
                <Button size="sm" variant="outline" disabled={!note.title.trim()}>Notiz speichern</Button>
              </form>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
