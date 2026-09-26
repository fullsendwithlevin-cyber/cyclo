import { AlertTriangle, Check, Circle, CircleDot, Clock, MinusCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type StepStatus = "PENDING" | "RUNNING" | "DONE" | "WAITING" | "FAILED" | "SKIPPED" | "pending" | "running" | "done" | "waiting" | "failed" | "skipped";

export function StepIcon({ status }: { status: string }) {
  const s = status.toUpperCase();
  if (s === "DONE" || s === "SUCCEEDED") return <Check className="h-3.5 w-3.5 text-success" aria-label="erledigt" />;
  if (s === "RUNNING") return <CircleDot className="animate-pulse-dot h-3.5 w-3.5 text-primary" aria-label="läuft" />;
  if (s === "WAITING" || s === "AWAITING_CONFIRMATION") return <AlertTriangle className="h-3.5 w-3.5 text-warning" aria-label="wartet" />;
  if (s === "FAILED" || s === "DENIED") return <X className="h-3.5 w-3.5 text-danger" aria-label="fehlgeschlagen" />;
  if (s === "REJECTED") return <MinusCircle className="h-3.5 w-3.5 text-muted-foreground" aria-label="abgelehnt" />;
  if (s === "SKIPPED") return <MinusCircle className="h-3.5 w-3.5 text-muted-foreground" aria-label="übersprungen" />;
  if (s === "QUEUED") return <Clock className="h-3.5 w-3.5 text-muted-foreground" aria-label="geplant" />;
  return <Circle className="h-3.5 w-3.5 text-muted-foreground" aria-label="offen" />;
}

/** Transparente Anzeige laufender Agentenprozesse (✓ erledigt, ● läuft, ○ offen, ⚠ wartet). */
export function RunSteps({ steps, className }: { steps: { title: string; status: string }[]; className?: string }) {
  if (!steps.length) return null;
  return (
    <ol className={cn("space-y-1", className)}>
      {steps.map((s, i) => (
        <li key={i} className={cn("flex items-center gap-2 text-sm", s.status.toUpperCase() === "PENDING" && "text-muted-foreground")}>
          <StepIcon status={s.status} />
          <span className="truncate">{s.title}</span>
        </li>
      ))}
    </ol>
  );
}
