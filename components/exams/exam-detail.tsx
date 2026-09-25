"use client";

import { ArrowLeft, Pencil, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, ErrorBox, SkeletonList } from "@/components/ui/feedback";
import { VisualizationView } from "@/components/visualization/visualization-view";
import { apiFetch, useApi } from "@/lib/client/api";
import { fmtDateTime, relativeDays } from "@/lib/client/format";
import { ExamDialog, type ExamDTO } from "./exams-view";

export function ExamDetail({ id }: { id: string }) {
  const { data, error, isLoading, mutate } = useApi<{ exam: ExamDTO }>(`/api/exams/${id}`);
  const [editing, setEditing] = useState(false);
  const router = useRouter();
  if (isLoading) return <SkeletonList rows={5} />;
  if (error || !data) return <ErrorBox error={error} onRetry={() => mutate()} />;
  const e = data.exam;
  const study = e.events.filter((x) => x.kind === "STUDY_BLOCK");
  const prompt = `Organisiere meine Prüfung „${e.subject}: ${e.title}“ (Prüfungs-ID ${e.id}): Stoff in Notizen und Unterlagen suchen, Lernplan erstellen und Lerntermine eintragen.`;

  return (
    <div className="space-y-4">
      <Link href="/exams" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Prüfungen</Link>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{e.subject}</h1>
          <p className="text-sm text-muted-foreground">{e.title} · {fmtDateTime(e.start)} ({relativeDays(e.start)}){e.location ? ` · ${e.location}` : ""}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /> Bearbeiten</Button>
          <Button variant="ghost" onClick={async () => { if (confirm("Prüfung löschen?")) { await apiFetch(`/api/exams/${id}`, { method: "DELETE" }); router.push("/exams"); } }} aria-label="Löschen"><Trash2 className="h-4 w-4" /></Button>
          <Button onClick={() => router.push(`/chat?q=${encodeURIComponent(prompt)}`)}><Sparkles className="h-4 w-4" /> Vorbereitung organisieren</Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader title="Lernplan" description={study.length ? `${study.filter((s) => new Date(s.end) < new Date()).length} von ${study.length} Lernblöcken erledigt` : undefined} />
          <CardBody>
            {study.length ? (
              <VisualizationView spec={{ type: "study_plan", title: `Lernplan ${e.subject}`, sessions: study.map((s) => ({ start: s.start, end: s.end, topic: s.title.replace(/^Lernen [^:]+:\s*/, ""), status: new Date(s.end) < new Date() ? "done" : s.status === "PROPOSED" ? "proposed" : "planned" })) }} />
            ) : (
              <EmptyState title="Noch kein Lernplan" description="Lass den Assistenten Stoff suchen und Lernblöcke in freie Zeiten legen." />
            )}
          </CardBody>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Themen" />
            <CardBody>
              {e.topics.length ? <ul className="flex flex-wrap gap-1.5">{e.topics.map((t) => <li key={t}><Badge tone="primary">{t}</Badge></li>)}</ul> : <p className="text-sm text-muted-foreground">Noch keine Themen erfasst.</p>}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Aufgaben" />
            <CardBody>
              {e.tasks.length ? <ul className="space-y-1 text-sm">{e.tasks.map((t) => <li key={t.id} className={t.status === "DONE" ? "text-muted-foreground line-through" : ""}>{t.title}</li>)}</ul> : <p className="text-sm text-muted-foreground">Keine Aufgaben verknüpft.</p>}
            </CardBody>
          </Card>
          {e.notes && (
            <Card>
              <CardHeader title="Notizen" />
              <CardBody><p className="whitespace-pre-wrap text-sm">{e.notes}</p></CardBody>
            </Card>
          )}
        </div>
      </div>
      {editing && <ExamDialog open exam={e} onClose={() => setEditing(false)} onSaved={() => mutate()} />}
    </div>
  );
}
