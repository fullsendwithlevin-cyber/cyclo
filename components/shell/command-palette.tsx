"use client";

import { ArrowRight, MessageSquare, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/client/api";
import type { SearchResult } from "@/lib/search/global";
import { KIND_LABEL, ResultIcon } from "@/components/search/result-icon";
import { Spinner } from "@/components/ui/feedback";
import { NAV } from "./nav";

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);

  // Wird nur bei geöffneter Palette gemountet → frischer Zustand bei jedem Öffnen
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  useEffect(() => {
    if (q.trim().length < 2) return;
    const t = setTimeout(() => {
      setLoading(true);
      apiFetch<{ results: SearchResult[] }>(`/api/search?live=0&q=${encodeURIComponent(q)}`)
        .then((r) => setResults(r.results.slice(0, 8)))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  const shown = q.trim().length >= 2 ? results : [];
  const nav = q ? NAV.filter((n) => n.label.toLowerCase().includes(q.toLowerCase())).slice(0, 4) : NAV.slice(0, 6);
  type Item = { key: string; label: string; sub?: string; icon: React.ReactNode; go: () => void };
  const items: Item[] = [
    ...(q.trim()
      ? [{ key: "ask", label: `Assistent fragen: „${q}“`, icon: <MessageSquare className="h-4 w-4" />, go: () => router.push(`/chat?q=${encodeURIComponent(q)}`) }]
      : []),
    ...shown.map((r) => ({
      key: `${r.kind}:${r.id}`,
      label: r.title,
      sub: KIND_LABEL[r.kind],
      icon: <ResultIcon kind={r.kind} />,
      go: () => (r.url.startsWith("http") ? window.open(r.url, "_blank", "noopener") : router.push(r.url)),
    })),
    ...(q.trim().length >= 2 ? [{ key: "all", label: "Alle Ergebnisse anzeigen", icon: <Search className="h-4 w-4" />, go: () => router.push(`/search?q=${encodeURIComponent(q)}`) }] : []),
    ...nav.map((n) => ({ key: n.href, label: n.label, sub: "Seite", icon: <n.icon className="h-4 w-4" />, go: () => router.push(n.href) })),
  ];

  const select = (i: number) => {
    items[i]?.go();
    onClose();
  };

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="mx-auto mt-[12vh] w-[calc(100%-2rem)] max-w-xl rounded-xl border bg-card p-0 text-foreground shadow-2xl backdrop:bg-black/40"
      aria-label="Suche und Befehle"
    >
      <div className="flex items-center gap-2 border-b px-4">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          autoFocus
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter") e.preventDefault();
            if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, items.length - 1));
            if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
            if (e.key === "Enter") select(active);
          }}
          placeholder="Suchen oder Frage stellen …"
          className="h-12 flex-1 bg-transparent text-sm outline-none"
          aria-label="Suchbegriff"
        />
        {loading && <Spinner />}
      </div>
      <ul className="max-h-[50vh] overflow-y-auto p-2" role="listbox">
        {items.map((it, i) => (
          <li key={it.key} role="option" aria-selected={i === active}>
            <button
              onMouseEnter={() => setActive(i)}
              onClick={() => select(i)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm ${i === active ? "bg-muted" : ""}`}
            >
              <span className="text-muted-foreground">{it.icon}</span>
              <span className="min-w-0 flex-1 truncate">{it.label}</span>
              {it.sub && <span className="text-xs text-muted-foreground">{it.sub}</span>}
              {i === active && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />}
            </button>
          </li>
        ))}
      </ul>
    </dialog>
  );
}
