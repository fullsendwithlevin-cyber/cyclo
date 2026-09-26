"use client";

import { FileText, NotebookPen, Upload } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorBox, SkeletonList } from "@/components/ui/feedback";
import { Select } from "@/components/ui/input";
import { PageHeader, Tabs } from "@/components/ui/page-header";
import { useToast } from "@/components/ui/toast";
import { apiFetch, ApiError, useApi } from "@/lib/client/api";
import { fmtDate, fmtSize } from "@/lib/client/format";
import { cn } from "@/lib/utils";

interface DocDTO {
  id: string;
  title: string;
  filename: string;
  mimeType: string;
  size: number;
  status: string;
  source: string;
  error: string | null;
  createdAt: string;
  pageCount: number | null;
}

export const DOC_SOURCE: Record<string, string> = { UPLOAD: "Upload", ONENOTE: "OneNote", GOOGLE_DRIVE: "Drive", AGENT: "Agent", WEB: "Web", GMAIL: "E-Mail" };
export const DOC_STATUS: Record<string, { label: string; tone: "success" | "warning" | "danger" | "default" }> = {
  UPLOADED: { label: "Wartet", tone: "default" },
  PROCESSING: { label: "Wird verarbeitet", tone: "warning" },
  INDEXED: { label: "Durchsuchbar", tone: "success" },
  FAILED: { label: "Fehler", tone: "danger" },
};

export function DocumentsView() {
  const [source, setSource] = useState<string>("all");
  const { data, error, isLoading, mutate } = useApi<{ documents: DocDTO[] }>(`/api/documents${source !== "all" ? `?source=${source}` : ""}`, {
    refreshInterval: (d) => (d?.documents.some((x) => x.status === "UPLOADED" || x.status === "PROCESSING") ? 4000 : 0),
  });
  const { data: projects } = useApi<{ projects: { id: string; name: string }[] }>("/api/projects");
  const [projectId, setProjectId] = useState("");
  const [drag, setDrag] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.set("file", file);
      if (projectId) form.set("projectId", projectId);
      try {
        const res = await apiFetch<{ duplicate: boolean }>("/api/documents", { form });
        toast(res.duplicate ? `„${file.name}“ ist bereits vorhanden` : `„${file.name}“ hochgeladen – wird verarbeitet`);
      } catch (e) {
        toast(e instanceof ApiError ? `${file.name}: ${e.reason}` : "Upload fehlgeschlagen", "error");
      }
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
    void mutate();
  };

  return (
    <div>
      <PageHeader title="Dokumente" description="Hochgeladene Dateien, OneNote-Seiten und Importe – semantisch durchsuchbar." />
      <div
        onDragOver={(e) => (e.preventDefault(), setDrag(true))}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => (e.preventDefault(), setDrag(false), upload(e.dataTransfer.files))}
        className={cn("mb-4 flex flex-col items-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors", drag ? "border-primary bg-accent/50" : "bg-card")}
      >
        <Upload className="h-6 w-6 text-muted-foreground" />
        <p className="text-sm">Dateien hierher ziehen oder</p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button onClick={() => fileRef.current?.click()} loading={uploading}>Dateien auswählen</Button>
          <Select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-48" aria-label="Projekt zuordnen">
            <option value="">ohne Projekt</option>
            {projects?.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </div>
        <p className="text-xs text-muted-foreground">PDF, DOCX, XLSX, PPTX, TXT, MD, CSV, Bilder (Texterkennung per KI)</p>
        <input ref={fileRef} type="file" multiple hidden accept=".pdf,.docx,.xlsx,.pptx,.txt,.md,.csv,.png,.jpg,.jpeg,.webp,.gif" onChange={(e) => upload(e.target.files)} />
      </div>

      <Tabs value={source} onChange={setSource} items={[{ value: "all", label: "Alle" }, { value: "UPLOAD", label: "Uploads" }, { value: "ONENOTE", label: "OneNote" }, { value: "GOOGLE_DRIVE", label: "Drive" }, { value: "AGENT", label: "Vom Agenten" }]} />
      <div className="mt-4">
        <ErrorBox error={error} onRetry={() => mutate()} />
        {isLoading ? (
          <SkeletonList rows={4} />
        ) : !data?.documents.length ? (
          <EmptyState icon={<FileText className="h-6 w-6" />} title="Keine Dokumente" />
        ) : (
          <Card className="divide-y">
            {data.documents.map((d) => (
              <Link key={d.id} href={`/documents/${d.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50">
                {d.source === "ONENOTE" ? <NotebookPen className="h-4 w-4 text-muted-foreground" /> : <FileText className="h-4 w-4 text-muted-foreground" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{d.title}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{DOC_SOURCE[d.source] ?? d.source} · {fmtDate(d.createdAt)}{d.source === "UPLOAD" ? ` · ${fmtSize(d.size)}` : ""}{d.error ? ` · ${d.error}` : ""}</p>
                </div>
                <Badge tone={DOC_STATUS[d.status].tone}>{DOC_STATUS[d.status].label}</Badge>
              </Link>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
