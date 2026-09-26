"use client";

import { ChevronLeft, ChevronRight, MapPin, Plus, Sparkles, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { CalendarEventDTO } from "@/lib/calendar/types";
import type { ErrorInfo } from "@/lib/errors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState, ErrorBox, Notice, SkeletonList } from "@/components/ui/feedback";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { useToast } from "@/components/ui/toast";
import { apiFetch, ApiError, useApi } from "@/lib/client/api";
import { fmtDate, fmtDateTime, fmtTime, toLocalInput } from "@/lib/client/format";
import { cn } from "@/lib/utils";

interface Agenda {
  events: CalendarEventDTO[];
  googleConnected: boolean;
  warnings: ErrorInfo[];
}

const KIND_STYLE: Record<string, string> = {
  EXAM: "border-l-danger bg-danger/10",
  STUDY_BLOCK: "border-l-primary bg-accent",
  WORK: "border-l-warning bg-warning/10",
  REMINDER: "border-l-muted-foreground bg-muted",
  EVENT: "border-l-success bg-success/10",
};
const KIND_LABEL: Record<string, string> = { EVENT: "Termin", STUDY_BLOCK: "Lernblock", EXAM: "Prüfung", WORK: "Arbeit", REMINDER: "Erinnerung" };

function startOfWeek(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  return x;
}

export function CalendarView() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const weekEnd = useMemo(() => new Date(weekStart.getTime() + 7 * 864e5), [weekStart]);
  const { data, error, isLoading, mutate } = useApi<Agenda>(`/api/calendar/events?from=${weekStart.toISOString()}&to=${weekEnd.toISOString()}`);
  const [selected, setSelected] = useState<CalendarEventDTO | null>(null);
  const [creating, setCreating] = useState(false);
  const toast = useToast();

  const days = Array.from({ length: 7 }, (_, i) => new Date(weekStart.getTime() + i * 864e5));
  const byDay = (d: Date) => (data?.events ?? []).filter((e) => new Date(e.start).toDateString() === d.toDateString() || (e.allDay && new Date(e.start) <= d && new Date(e.end) > d));

  return (
    <div>
      <PageHeader
        title="Kalender"
        description={data ? (data.googleConnected ? "App-Termine und Google Calendar" : "App-Kalender · Google Calendar nicht verbunden") : undefined}
        actions={<Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Termin</Button>}
      />
      <QuickAdd onCreated={() => mutate()} />

      <div className="my-4 flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => setWeekStart(new Date(weekStart.getTime() - 7 * 864e5))} aria-label="Vorherige Woche"><ChevronLeft className="h-4 w-4" /></Button>
        <Button variant="outline" size="sm" onClick={() => setWeekStart(startOfWeek(new Date()))}>Heute</Button>
        <Button variant="outline" size="icon" onClick={() => setWeekStart(new Date(weekStart.getTime() + 7 * 864e5))} aria-label="Nächste Woche"><ChevronRight className="h-4 w-4" /></Button>
        <p className="ml-2 text-sm font-medium">{fmtDate(weekStart)} – {fmtDate(new Date(weekEnd.getTime() - 1))}</p>
      </div>

      <ErrorBox error={error} onRetry={() => mutate()} />
      {data?.warnings.map((w, i) => <ErrorBox key={i} error={w} className="mb-3" />)}

      {isLoading ? (
        <SkeletonList rows={6} />
      ) : (
        <div className="grid gap-2 md:grid-cols-7">
          {days.map((d) => {
            const events = byDay(d);
            const today = d.toDateString() === new Date().toDateString();
            return (
              <Card key={d.toISOString()} className={cn("min-h-28 p-2", today && "ring-2 ring-primary/40")}>
                <p className={cn("mb-2 text-xs font-semibold", today ? "text-primary" : "text-muted-foreground")}>{fmtDate(d)}</p>
                {!events.length && <p className="text-[11px] text-muted-foreground md:hidden">Keine Termine</p>}
                <ul className="space-y-1">
                  {events.map((e) => (
                    <li key={e.id}>
                      <button onClick={() => setSelected(e)} className={cn("w-full rounded-md border-l-2 px-2 py-1 text-left text-xs", KIND_STYLE[e.kind] ?? KIND_STYLE.EVENT, e.status === "PROPOSED" && "border-dashed opacity-80", e.status === "CANCELLED" && "line-through opacity-50")}>
                        {!e.allDay && <span className="block font-mono text-[10px] text-muted-foreground tabular-nums">{fmtTime(e.start)}</span>}
                        <span className="line-clamp-2">{e.title}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      )}
      {!isLoading && data && !data.events.length && <EmptyState className="mt-4" title="Keine Termine in dieser Woche" />}

      <EventDetails
        event={selected}
        googleConnected={Boolean(data?.googleConnected)}
        onClose={() => setSelected(null)}
        onChanged={() => (setSelected(null), mutate())}
        toast={toast}
      />
      <EventDialog open={creating} onClose={() => setCreating(false)} googleConnected={Boolean(data?.googleConnected)} onSaved={() => mutate()} />
    </div>
  );
}

function QuickAdd({ onCreated }: { onCreated: () => void }) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<{ title: string; start: string; end: string; allDay: boolean; isExam: boolean; conflicts: string[] } | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const interpret = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await apiFetch<{ interpretation: NonNullable<typeof preview> }>("/api/calendar/quick-add", { body: { text, preview: true } });
      setPreview(res.interpretation);
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setBusy(false);
    }
  };
  const create = async () => {
    setBusy(true);
    try {
      await apiFetch("/api/calendar/quick-add", { body: { text } });
      toast(preview?.isExam ? "Prüfung und Termin erstellt" : "Termin erstellt");
      setText("");
      setPreview(null);
      onCreated();
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-3">
      <form className="flex gap-2" onSubmit={(e) => (e.preventDefault(), preview ? create() : interpret())}>
        <div className="relative flex-1">
          <Sparkles className="absolute top-2.5 left-3 h-4 w-4 text-primary" />
          <Input value={text} onChange={(e) => (setText(e.target.value), setPreview(null))} placeholder="z. B. „Prüfung Elektrotechnik Freitag 10:00“" className="pl-9" aria-label="Schnelleingabe" />
        </div>
        <Button type="submit" loading={busy} disabled={text.trim().length < 3} variant={preview ? "primary" : "secondary"}>{preview ? "Eintragen" : "Erkennen"}</Button>
      </form>
      {preview && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          {preview.isExam && <Badge tone="danger">Prüfung</Badge>}
          <b>{preview.title}</b>
          <span className="text-muted-foreground">{preview.allDay ? `${fmtDate(preview.start)}, ganztägig` : `${fmtDateTime(preview.start)}–${fmtTime(preview.end)}`}</span>
          {preview.conflicts.length > 0 && <span className="text-warning">Konflikt mit: {preview.conflicts.join(", ")}</span>}
        </div>
      )}
      <ErrorBox error={error} className="mt-2" />
    </Card>
  );
}

function EventDetails({ event, onClose, onChanged, googleConnected, toast }: { event: CalendarEventDTO | null; onClose: () => void; onChanged: () => void; googleConnected: boolean; toast: (t: string, tone?: "success" | "error") => void }) {
  const [busy, setBusy] = useState(false);
  if (!event) return null;
  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true);
    try {
      await fn();
      toast(msg);
      onChanged();
    } catch (e) {
      toast(e instanceof ApiError ? `${e.reason} ${e.solution ?? ""}` : "Fehler", "error");
    } finally {
      setBusy(false);
    }
  };
  const readOnly = event.source === "SCHOOL";
  return (
    <Dialog
      open
      onClose={onClose}
      title={event.title}
      footer={
        <>
          {!readOnly && (
            <Button variant="ghost" loading={busy} onClick={() => confirm("Termin wirklich löschen?") && run(() => apiFetch(`/api/calendar/events/${encodeURIComponent(event.id)}`, { method: "DELETE" }), "Termin gelöscht")}>
              <Trash2 className="h-4 w-4" /> Löschen
            </Button>
          )}
          {event.status === "PROPOSED" && (
            <>
              <Button variant="outline" loading={busy} onClick={() => run(() => apiFetch(`/api/calendar/events/${event.id}/confirm`, { body: { target: "local" } }), "Termin bestätigt")}>In App übernehmen</Button>
              {googleConnected && <Button loading={busy} onClick={() => run(() => apiFetch(`/api/calendar/events/${event.id}/confirm`, { body: { target: "google" } }), "In Google Calendar eingetragen")}>In Google eintragen</Button>}
            </>
          )}
        </>
      }
    >
      <div className="space-y-2 text-sm">
        <div className="flex flex-wrap gap-1.5">
          <Badge tone="outline">{KIND_LABEL[event.kind] ?? event.kind}</Badge>
          <Badge tone="outline">{event.source === "GOOGLE_CALENDAR" ? "Google Calendar" : event.source === "SCHOOL" ? "Schulplattform" : event.source === "AGENT" ? "vom Agenten" : "App"}</Badge>
          {event.status === "PROPOSED" && <Badge tone="warning">Vorschlag</Badge>}
        </div>
        <p>{event.allDay ? `${fmtDate(event.start)}, ganztägig` : `${fmtDateTime(event.start)} – ${fmtTime(event.end)}`}</p>
        {event.location && <p className="flex items-center gap-1 text-muted-foreground"><MapPin className="h-3.5 w-3.5" /> {event.location}</p>}
        {event.description && <p className="whitespace-pre-wrap text-muted-foreground">{event.description}</p>}
        {event.htmlLink && <a href={event.htmlLink} target="_blank" rel="noopener noreferrer" className="text-primary underline">In Google Calendar öffnen</a>}
        {readOnly && <Notice>Einträge der Schulplattform werden beim nächsten Abgleich aktualisiert und sind hier schreibgeschützt.</Notice>}
      </div>
    </Dialog>
  );
}

function EventDialog({ open, onClose, onSaved, googleConnected }: { open: boolean; onClose: () => void; onSaved: () => void; googleConnected: boolean }) {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  const [form, setForm] = useState({ title: "", start: toLocalInput(new Date(now.getTime() + 3600e3)), end: toLocalInput(new Date(now.getTime() + 7200e3)), location: "", description: "", kind: "EVENT", target: googleConnected ? "google" : "local" });
  const [error, setError] = useState<ApiError | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/api/calendar/events", { body: { ...form, start: new Date(form.start).toISOString(), end: new Date(form.end).toISOString(), location: form.location || null, description: form.description || null } });
      onSaved();
      onClose();
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open={open} onClose={onClose} title="Neuer Termin" footer={<><Button variant="ghost" onClick={onClose}>Abbrechen</Button><Button onClick={save} loading={saving} disabled={!form.title.trim()}>Speichern</Button></>}>
      <div className="space-y-3">
        <ErrorBox error={error} />
        <div><Label htmlFor="e-title">Titel</Label><Input id="e-title" value={form.title} onChange={set("title")} autoFocus /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label htmlFor="e-start">Beginn</Label><Input id="e-start" type="datetime-local" value={form.start} onChange={set("start")} /></div>
          <div><Label htmlFor="e-end">Ende</Label><Input id="e-end" type="datetime-local" value={form.end} onChange={set("end")} /></div>
          <div><Label htmlFor="e-kind">Art</Label><Select id="e-kind" value={form.kind} onChange={set("kind")}>{Object.entries(KIND_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></div>
          <div>
            <Label htmlFor="e-target">Kalender</Label>
            <Select id="e-target" value={form.target} onChange={set("target")}>
              <option value="local">App-Kalender</option>
              <option value="google" disabled={!googleConnected}>Google Calendar{googleConnected ? "" : " (nicht verbunden)"}</option>
            </Select>
          </div>
        </div>
        <div><Label htmlFor="e-loc">Ort</Label><Input id="e-loc" value={form.location} onChange={set("location")} /></div>
        <div><Label htmlFor="e-desc">Beschreibung</Label><Textarea id="e-desc" value={form.description} onChange={set("description")} /></div>
      </div>
    </Dialog>
  );
}
