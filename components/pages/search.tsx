"use client";

import { ExternalLink, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { ErrorInfo } from "@/lib/errors";
import type { SearchKind, SearchResult } from "@/lib/search/global";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorBox, SkeletonList } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { KIND_LABEL, ResultIcon } from "@/components/search/result-icon";
import { useApi } from "@/lib/client/api";
import { fmtDate } from "@/lib/client/format";
import { cn } from "@/lib/utils";

const KINDS: SearchKind[] = ["task", "document", "onenote", "email", "event", "exam", "project", "note", "memory"];

export function SearchView({ initial }: { initial: string }) {
  const [q, setQ] = useState(initial);
  const [debounced, setDebounced] = useState(initial);
  const [kinds, setKinds] = useState<SearchKind[]>([]);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 300);
    return () => clearTimeout(t);
  }, [q]);
  const { data, error, isLoading } = useApi<{ results: SearchResult[]; warnings: ErrorInfo[] }>(
    debounced.trim().length >= 2 ? `/api/search?q=${encodeURIComponent(debounced)}${kinds.length ? `&kinds=${kinds.join(",")}` : ""}` : null,
  );
  const counts = new Map<SearchKind, number>();
  for (const r of data?.results ?? []) counts.set(r.kind, (counts.get(r.kind) ?? 0) + 1);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="Suche" description="Aufgaben, Dokumente, E-Mails, OneNote, Kalender, Projekte und Gedächtnis." />
      <div className="relative">
        <Search className="absolute top-2.5 left-3 h-4 w-4 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} className="h-10 pl-9" placeholder="Suchbegriff …" autoFocus aria-label="Suchbegriff" />
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Nach Quelle filtern">
        {KINDS.map((k) => {
          const on = kinds.includes(k);
          return (
            <button key={k} onClick={() => setKinds((x) => (on ? x.filter((y) => y !== k) : [...x, k]))} aria-pressed={on} className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs", on ? "border-primary bg-accent text-accent-foreground" : "bg-card text-muted-foreground hover:text-foreground")}>
              <ResultIcon kind={k} className="h-3 w-3" /> {KIND_LABEL[k]}
              {!kinds.length && counts.get(k) ? <span className="text-muted-foreground">{counts.get(k)}</span> : null}
            </button>
          );
        })}
      </div>
      <ErrorBox error={error} />
      {data?.warnings.map((w, i) => <ErrorBox key={i} error={w} />)}
      {isLoading ? (
        <SkeletonList rows={5} />
      ) : debounced.trim().length < 2 ? (
        <EmptyState icon={<Search className="h-6 w-6" />} title="Suchbegriff eingeben" />
      ) : !data?.results.length ? (
        <EmptyState title="Keine Treffer" description="Andere Begriffe probieren oder den Assistenten fragen." action={<Link href={`/chat?q=${encodeURIComponent(debounced)}`} className="text-sm text-primary">Assistenten fragen</Link>} />
      ) : (
        <Card className="divide-y">
          {data.results.map((r) => {
            const external = r.url.startsWith("http");
            const inner = (
              <>
                <span className="mt-0.5 text-muted-foreground"><ResultIcon kind={r.kind} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{r.title}</span>
                  {r.snippet && <span className="line-clamp-2 text-xs text-muted-foreground">{r.snippet}</span>}
                </span>
                <span className="shrink-0 text-right text-[11px] text-muted-foreground">
                  {KIND_LABEL[r.kind]}
                  {r.date && <span className="block">{fmtDate(r.date)}</span>}
                </span>
                {external && <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />}
              </>
            );
            return external ? (
              <a key={`${r.kind}:${r.id}`} href={r.url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-3 px-4 py-3 hover:bg-muted/50">{inner}</a>
            ) : (
              <Link key={`${r.kind}:${r.id}`} href={r.url} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/50">{inner}</Link>
            );
          })}
        </Card>
      )}
    </div>
  );
}
