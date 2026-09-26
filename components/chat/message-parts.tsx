"use client";

import { AlertTriangle, Check, ChevronDown, ExternalLink, FileText, Paperclip, ShieldAlert, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { MessagePart } from "@/lib/agents/orchestrator";
import type { SourceRef } from "@/lib/tools/types";
import { Button } from "@/components/ui/button";
import { StepIcon } from "@/components/agent/run-steps";
import { VisualizationView } from "@/components/visualization/visualization-view";
import { ErrorBox } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";

const PERMISSION_LABEL: Record<string, string> = {
  READ: "Lesen",
  WRITE: "Schreiben",
  DELETE: "Löschen",
  SEND: "Senden",
  EXTERNAL_ACTION: "Externe Aktion",
  FINANCIAL: "Finanziell",
  SENSITIVE: "Sensibel",
};

export function ToolActivity({ parts }: { parts: Extract<MessagePart, { type: "tool" }>[] }) {
  const [open, setOpen] = useState(parts.length <= 6);
  if (!parts.length) return null;
  const visible = open ? parts : parts.slice(0, 3);
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <ul className="space-y-1">
        {visible.map((p, i) => (
          <li key={`${p.toolCallId}-${i}`} className="flex items-start gap-2 text-xs">
            <span className="mt-0.5">
              <StepIcon status={p.status === "succeeded" ? "DONE" : p.status === "awaiting_confirmation" ? "WAITING" : p.status.toUpperCase()} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="font-medium">{p.title}</span>
              {p.summary && <span className="text-muted-foreground"> – {p.summary}</span>}
              {p.verified && <span className="ml-1 text-success" title="Ergebnis wurde verifiziert">· verifiziert</span>}
            </span>
          </li>
        ))}
      </ul>
      {parts.length > 6 && (
        <button onClick={() => setOpen(!open)} className="mt-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} /> {open ? "weniger" : `${parts.length - 3} weitere Schritte`}
        </button>
      )}
    </div>
  );
}

export function ConfirmationCard({
  part,
  status,
  onDecide,
}: {
  part: Extract<MessagePart, { type: "confirmation" }>;
  status?: string;
  onDecide: (approve: boolean) => Promise<void>;
}) {
  const [busy, setBusy] = useState<"yes" | "no" | null>(null);
  const decided = status && status !== "AWAITING_CONFIRMATION";
  return (
    <div className={cn("rounded-xl border p-3", decided ? "bg-muted/30" : "border-warning/50 bg-warning/5")}>
      <div className="flex items-start gap-2">
        <ShieldAlert className={cn("mt-0.5 h-4 w-4 shrink-0", decided ? "text-muted-foreground" : "text-warning")} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {part.title} <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">{PERMISSION_LABEL[part.permission]}</span>
          </p>
          <p className="mt-1 text-sm whitespace-pre-line">{part.description}</p>
          <p className="mt-1 text-xs text-muted-foreground">{part.reason}</p>
        </div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        {decided ? (
          <span className={cn("flex items-center gap-1 text-xs", status === "REJECTED" ? "text-muted-foreground" : status === "FAILED" ? "text-danger" : "text-success")}>
            {status === "REJECTED" ? <X className="h-3.5 w-3.5" /> : status === "FAILED" ? <AlertTriangle className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
            {status === "REJECTED" ? "Abgelehnt" : status === "FAILED" ? "Fehlgeschlagen" : status === "RUNNING" ? "Wird ausgeführt" : "Ausgeführt"}
          </span>
        ) : (
          <>
            <Button size="sm" variant="ghost" loading={busy === "no"} disabled={!!busy} onClick={async () => (setBusy("no"), await onDecide(false).finally(() => setBusy(null)))}>
              Ablehnen
            </Button>
            <Button size="sm" loading={busy === "yes"} disabled={!!busy} onClick={async () => (setBusy("yes"), await onDecide(true).finally(() => setBusy(null)))}>
              Bestätigen
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

const SOURCE_LABEL: Record<string, string> = { document: "Dokument", onenote: "OneNote", drive: "Drive", email: "E-Mail", calendar: "Termin", task: "Aufgabe", exam: "Prüfung", web: "Web", memory: "Gedächtnis", project: "Projekt" };

export function Sources({ sources, highlight }: { sources: SourceRef[]; highlight?: number | null }) {
  const [open, setOpen] = useState(false);
  if (!sources.length) return null;
  const isOpen = open || highlight != null;
  return (
    <div>
      <button onClick={() => setOpen(!isOpen)} className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-muted">
        <FileText className="h-3.5 w-3.5" /> {sources.length} {sources.length === 1 ? "Quelle" : "Quellen"} {isOpen ? "ausblenden" : "anzeigen"}
      </button>
      {isOpen && (
        <ol className="mt-2 space-y-1.5">
          {sources.map((s, i) => {
            const external = s.url?.startsWith("http");
            const content = (
              <>
                <span className="mt-0.5 flex h-4 min-w-4 items-center justify-center rounded bg-accent px-1 text-[10px] font-semibold text-accent-foreground">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium">{s.title}{s.location ? ` · ${s.location}` : ""}</span>
                  <span className="text-[11px] text-muted-foreground">{SOURCE_LABEL[s.kind] ?? s.kind}</span>
                  {s.snippet && <span className="line-clamp-2 block text-[11px] text-muted-foreground">{s.snippet}</span>}
                </span>
                {external && <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />}
              </>
            );
            const cls = cn("flex items-start gap-2 rounded-lg p-2 hover:bg-muted", highlight === i + 1 && "bg-accent/60");
            return (
              <li key={`${s.kind}-${s.id}-${i}`}>
                {s.url ? (
                  external ? (
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className={cls}>{content}</a>
                  ) : (
                    <Link href={s.url} className={cls}>{content}</Link>
                  )
                ) : (
                  <div className={cls}>{content}</div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

export function PartsView({ parts, toolCallStatus, onDecide, highlight }: { parts: MessagePart[]; toolCallStatus: Record<string, string>; onDecide: (toolCallId: string, approve: boolean) => Promise<void>; highlight?: number | null }) {
  const tools = parts.filter((p): p is Extract<MessagePart, { type: "tool" }> => p.type === "tool" && p.status !== "awaiting_confirmation");
  return (
    <div className="space-y-2">
      <ToolActivity parts={tools} />
      {parts.map((p, i) => {
        switch (p.type) {
          case "confirmation":
            return <ConfirmationCard key={i} part={p} status={toolCallStatus[p.toolCallId]} onDecide={(approve) => onDecide(p.toolCallId, approve)} />;
          case "visualization":
            return <VisualizationView key={i} spec={p.spec} />;
          case "sources":
            return <Sources key={i} sources={p.sources} highlight={highlight} />;
          case "error":
            return <ErrorBox key={i} error={p.error} />;
          case "warning":
            return <p key={i} className="flex items-center gap-1 text-xs text-warning"><AlertTriangle className="h-3.5 w-3.5" /> {p.text}</p>;
          case "attachment":
            return (
              <Link key={i} href={`/documents/${p.documentId}`} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted">
                <Paperclip className="h-3 w-3" /> {p.filename}
              </Link>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
