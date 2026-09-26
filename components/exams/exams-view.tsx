"use client";

import { GraduationCap, Plus } from "lucide-react";
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
import { useNow } from "@/lib/client/hooks";
import { fmtDateTime, relativeDays, toLocalInput } from "@/lib/client/format";

export interface ExamDTO {
  id: string;
  subject: string;
  title: string;
  start: string;
  end: string | null;
  location: string | null;
  topics: string[];
  notes: string | null;
  source: string;
  events: { id: string; title: string; start: string; end: string; kind: string; status: string }[];
  tasks: { id: string; title: string; status: string }[];
}

const SOURCE_LABEL: Record<string, string> = { MANUAL: "manuell", AGENT: "Agent", SCHOOL: "Schulplattform", GMAIL: "E-Mail" };

export function ExamsView() {
  const { data, error, isLoading, mutate } = useApi<{ exams: ExamDTO[] }>("/api/exams");
  const [open, setOpen] = useState(false);
  const now = useNow();
  return (
    <div>
      <PageHeader title="Prüfungen" description="Anstehende Prüfungen, Lernpläne und Fortschritt." actions={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Prüfung</Button>} />
      <ErrorBox error={error} onRetry={() => mutate()} />
      {isLoading ? (
        <SkeletonList rows={3} />
      ) : !data?.exams.length ? (
        <EmptyState icon={<GraduationCap className="h-6 w-6" />} title="Keine anstehenden Prüfungen" description="Erfasse eine Prüfung, verbinde die Schulplattform (Einstellungen) oder schreibe im Chat „Prüfung Mathe Freitag 10 Uhr“." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {data.exams.map((e) => {
            const done = e.events.filter((s) => new Date(s.end).getTime() < now).length;
            const days = (new Date(e.start).getTime() - now) / 864e5;
            return (
              <Link key={e.id} href={`/exams/${e.id}`}>
                <Card className="h-full p-4 transition-colors hover:border-primary/40">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{e.subject}</p>
                      <p className="truncate text-sm text-muted-foreground">{e.title}</p>
                    </div>
                    <Badge tone={days < 3 ? "danger" : days < 8 ? "warning" : "outline"}>{relativeDays(e.start)}</Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{fmtDateTime(e.start)}{e.location ? ` · ${e.location}` : ""} · {SOURCE_LABEL[e.source] ?? e.source}</p>
                  {e.topics.length > 0 && <p className="mt-2 line-clamp-2 text-xs">{e.topics.join(" · ")}</p>}
                  <div className="mt-3 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${e.events.length ? (done / e.events.length) * 100 : 0}%` }} /></div>
                    <span className="text-[11px] text-muted-foreground">{e.events.length ? `${done}/${e.events.length} Lernblöcke` : "kein Lernplan"}</span>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
      <ExamDialog open={open} onClose={() => setOpen(false)} onSaved={() => mutate()} />
    </div>
  );
}

export function ExamDialog({ open, onClose, onSaved, exam }: { open: boolean; onClose: () => void; onSaved: () => void; exam?: ExamDTO }) {
  const [form, setForm] = useState(() => ({
    subject: exam?.subject ?? "",
    title: exam?.title ?? "Prüfung",
    start: exam ? toLocalInput(exam.start) : "",
    location: exam?.location ?? "",
    topics: exam?.topics.join("\n") ?? "",
    notes: exam?.notes ?? "",
  }));
  const [error, setError] = useState<ApiError | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const save = async () => {
    setSaving(true);
    setError(null);
    const body = { subject: form.subject, title: form.title, start: new Date(form.start).toISOString(), location: form.location || null, topics: form.topics.split("\n").map((t) => t.trim()).filter(Boolean), notes: form.notes || null };
    try {
      if (exam) await apiFetch(`/api/exams/${exam.id}`, { method: "PATCH", body });
      else await apiFetch("/api/exams", { body });
      onSaved();
      onClose();
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open={open} onClose={onClose} title={exam ? "Prüfung bearbeiten" : "Neue Prüfung"} footer={<><Button variant="ghost" onClick={onClose}>Abbrechen</Button><Button onClick={save} loading={saving} disabled={!form.subject || !form.start}>Speichern</Button></>}>
      <div className="space-y-3">
        <ErrorBox error={error} />
        <div className="grid grid-cols-2 gap-3">
          <div><Label htmlFor="x-subj">Fach</Label><Input id="x-subj" value={form.subject} onChange={set("subject")} autoFocus /></div>
          <div><Label htmlFor="x-title">Titel</Label><Input id="x-title" value={form.title} onChange={set("title")} /></div>
          <div><Label htmlFor="x-start">Datum & Zeit</Label><Input id="x-start" type="datetime-local" value={form.start} onChange={set("start")} /></div>
          <div><Label htmlFor="x-loc">Ort</Label><Input id="x-loc" value={form.location} onChange={set("location")} /></div>
        </div>
        <div><Label htmlFor="x-topics">Themen (eine pro Zeile)</Label><Textarea id="x-topics" value={form.topics} onChange={set("topics")} /></div>
        <div><Label htmlFor="x-notes">Notizen</Label><Textarea id="x-notes" value={form.notes} onChange={set("notes")} /></div>
      </div>
    </Dialog>
  );
}
