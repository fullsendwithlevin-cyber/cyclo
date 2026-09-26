"use client";

import { ArrowLeft, Download, ExternalLink, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ErrorBox, Notice, SkeletonList } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { apiFetch, useApi } from "@/lib/client/api";
import { fmtDateTime, fmtSize } from "@/lib/client/format";
import { DOC_SOURCE, DOC_STATUS } from "./documents-view";

interface DocFull {
  id: string;
  title: string;
  filename: string;
  size: number;
  status: string;
  source: string;
  url: string | null;
  storagePath: string | null;
  error: string | null;
  pageCount: number | null;
  createdAt: string;
  metadata: { extraction?: string; chunks?: number };
  project: { id: string; name: string } | null;
  chunks: { index: number; content: string; metadata: { page?: number; heading?: string } }[];
}

export function DocumentDetail({ id }: { id: string }) {
  const { data, error, isLoading, mutate } = useApi<{ document: DocFull }>(`/api/documents/${id}`, {
    refreshInterval: (d) => (d && (d.document.status === "UPLOADED" || d.document.status === "PROCESSING") ? 3000 : 0),
  });
  const router = useRouter();
  const toast = useToast();
  if (isLoading) return <SkeletonList rows={6} />;
  if (error || !data) return <ErrorBox error={error} onRetry={() => mutate()} />;
  const d = data.document;
  return (
    <div className="space-y-4">
      <Link href="/documents" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Dokumente</Link>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight">{d.title}</h1>
          <p className="text-sm text-muted-foreground">
            {DOC_SOURCE[d.source] ?? d.source} · {fmtDateTime(d.createdAt)}{d.pageCount ? ` · ${d.pageCount} Seiten` : ""}{d.source === "UPLOAD" ? ` · ${fmtSize(d.size)}` : ""}
            {d.project && <> · <Link href={`/projects/${d.project.id}`} className="underline">{d.project.name}</Link></>}
          </p>
          <div className="mt-2 flex gap-1.5">
            <Badge tone={DOC_STATUS[d.status].tone}>{DOC_STATUS[d.status].label}</Badge>
            {d.metadata.extraction === "ocr" && <Badge tone="primary">Texterkennung (KI)</Badge>}
            {d.metadata.chunks !== undefined && <Badge tone="outline">{d.metadata.chunks} Abschnitte</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {d.status === "INDEXED" && <Button variant="outline" onClick={() => router.push(`/chat?q=${encodeURIComponent(`Fasse das Dokument „${d.title}“ (ID ${d.id}) zusammen und erstelle eine Lernübersicht.`)}`)}><Sparkles className="h-4 w-4" /> Zusammenfassen</Button>}
          {d.url && <a href={d.url} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-2 rounded-lg border bg-card px-3 text-sm hover:bg-muted"><ExternalLink className="h-4 w-4" /> Original</a>}
          {d.storagePath && <a href={`/api/documents/${d.id}/download`} className="inline-flex h-9 items-center gap-2 rounded-lg border bg-card px-3 text-sm hover:bg-muted"><Download className="h-4 w-4" /> Download</a>}
          {d.storagePath && d.status === "FAILED" && <Button variant="outline" onClick={async () => { await apiFetch(`/api/documents/${d.id}`, { method: "POST" }); toast("Verarbeitung neu gestartet"); void mutate(); }}><RefreshCw className="h-4 w-4" /> Erneut verarbeiten</Button>}
          <Button variant="ghost" aria-label="Löschen" onClick={async () => { if (confirm("Dokument löschen?")) { await apiFetch(`/api/documents/${d.id}`, { method: "DELETE" }); router.push("/documents"); } }}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>
      {d.error && <ErrorBox error={{ code: "INTERNAL", action: "Verarbeitung", reason: d.error }} />}
      {(d.status === "UPLOADED" || d.status === "PROCESSING") && <Notice>Das Dokument wird im Hintergrund verarbeitet (Worker: <code>npm run worker</code>).</Notice>}
      <Card>
        <CardHeader title="Extrahierter Inhalt" description="So sieht der Assistent das Dokument (Abschnitte für die semantische Suche)." />
        <CardBody className="space-y-3">
          {d.chunks.length ? (
            d.chunks.map((c) => (
              <div key={c.index} className="rounded-lg bg-muted/40 p-3">
                <p className="mb-1 text-[11px] text-muted-foreground">#{c.index + 1}{c.metadata.page ? ` · Seite ${c.metadata.page}` : ""}{c.metadata.heading ? ` · ${c.metadata.heading}` : ""}</p>
                <p className="text-sm whitespace-pre-wrap">{c.content}</p>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">Noch kein Inhalt extrahiert.</p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
