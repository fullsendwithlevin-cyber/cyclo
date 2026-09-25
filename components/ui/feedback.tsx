"use client";

import { AlertTriangle, Inbox, Loader2, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import type { ErrorInfo } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-4 w-4 animate-spin text-muted-foreground", className)} aria-label="Lädt" />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />;
}

export function SkeletonList({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, description, action, className }: { icon?: ReactNode; title: string; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center", className)}>
      <div className="text-muted-foreground">{icon ?? <Inbox className="h-6 w-6" />}</div>
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="max-w-sm text-xs text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Fehleranzeige nach dem Schema Aktion · Grund · Lösung. */
export function ErrorBox({ error, onRetry, className }: { error: ErrorInfo | Error | null | undefined; onRetry?: () => void; className?: string }) {
  if (!error) return null;
  const info: ErrorInfo = "code" in error && "reason" in error ? (error as ErrorInfo) : { code: "INTERNAL", action: "Laden", reason: (error as Error).message };
  return (
    <div role="alert" className={cn("flex items-start gap-3 rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm", className)}>
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{info.action} fehlgeschlagen</p>
        <p className="text-muted-foreground">{info.reason}</p>
        {info.solution && <p className="mt-1 text-xs">Lösung: {info.solution}</p>}
      </div>
      {onRetry && (
        <Button size="sm" variant="ghost" onClick={onRetry} aria-label="Erneut versuchen">
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

export function Notice({ tone = "info", children, className }: { tone?: "info" | "warning"; children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-lg border p-3 text-sm", tone === "warning" ? "border-warning/40 bg-warning/10" : "bg-muted/60", className)}>{children}</div>
  );
}
