"use client";

import type { VisualizationSpec } from "@/lib/visualization/types";
import { fmtDate, fmtTime } from "@/lib/client/format";
import { cn } from "@/lib/utils";

const dayKey = (iso: string) => new Date(iso).toDateString();

function groupByDay<T extends { start: string }>(items: T[]) {
  const map = new Map<string, T[]>();
  for (const it of [...items].sort((a, b) => a.start.localeCompare(b.start))) {
    const k = dayKey(it.start);
    map.set(k, [...(map.get(k) ?? []), it]);
  }
  return [...map.values()];
}

/** Rendert vom Agenten erzeugte, validierte Visualisierungs-Spezifikationen. */
export function VisualizationView({ spec }: { spec: VisualizationSpec }) {
  return (
    <figure className="overflow-hidden rounded-xl border bg-card">
      <figcaption className="border-b px-4 py-2 text-xs font-semibold tracking-tight">{spec.title}</figcaption>
      <div className="max-h-[480px] overflow-auto p-4 text-sm">{render(spec)}</div>
    </figure>
  );
}

function render(spec: VisualizationSpec) {
  switch (spec.type) {
    case "table":
      return (
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr>{spec.columns.map((c, i) => <th key={i} className="border-b px-2 py-1.5 font-semibold">{c}</th>)}</tr>
          </thead>
          <tbody>
            {spec.rows.map((r, i) => (
              <tr key={i} className="even:bg-muted/40">
                {r.map((c, j) => <td key={j} className="px-2 py-1.5 align-top">{c ?? "–"}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      );
    case "timeline":
      return (
        <ol className="relative ml-2 border-l pl-5">
          {spec.items.map((it, i) => (
            <li key={i} className="mb-4 last:mb-0">
              <span className={cn("absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full border-2 border-card", it.tone === "important" ? "bg-danger" : it.tone === "done" ? "bg-success" : "bg-primary")} />
              <p className="text-[11px] text-muted-foreground">{fmtDate(it.date)}{it.date.includes("T") ? `, ${fmtTime(it.date)}` : ""}</p>
              <p className="font-medium">{it.title}</p>
              {it.detail && <p className="text-xs text-muted-foreground">{it.detail}</p>}
            </li>
          ))}
        </ol>
      );
    case "kanban":
      return (
        <div className="flex gap-3 overflow-x-auto">
          {spec.columns.map((col, i) => (
            <div key={i} className="w-56 shrink-0 rounded-lg bg-muted/60 p-2">
              <p className="mb-2 px-1 text-xs font-semibold">{col.title} <span className="text-muted-foreground">{col.cards.length}</span></p>
              <div className="space-y-1.5">
                {col.cards.map((c, j) => (
                  <div key={j} className="rounded-md border bg-card p-2">
                    <p className="text-xs">{c.title}</p>
                    {c.meta && <p className="text-[11px] text-muted-foreground">{c.meta}</p>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      );
    case "progress":
      return (
        <ul className="space-y-3">
          {spec.items.map((it, i) => {
            const pct = Math.min(100, (it.value / it.max) * 100);
            return (
              <li key={i}>
                <div className="flex justify-between text-xs"><span>{it.label}</span><span className="tabular-nums text-muted-foreground">{it.value}/{it.max}</span></div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
              </li>
            );
          })}
        </ul>
      );
    case "mindmap":
      return (
        <div className="flex flex-col items-center gap-4">
          <div className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">{spec.root}</div>
          <div className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {spec.branches.map((b, i) => (
              <div key={i} className="rounded-lg border-l-4 border-primary/60 bg-muted/50 p-3">
                <p className="text-sm font-medium">{b.label}</p>
                {b.children && (
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
                    {b.children.map((c, j) => <li key={j}>{c}</li>)}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      );
    case "flowchart":
      return <Flowchart spec={spec} />;
    case "study_plan":
      return (
        <div className="space-y-3">
          {groupByDay(spec.sessions).map((day, i) => (
            <div key={i} className="flex gap-3">
              <p className="w-24 shrink-0 text-xs font-medium text-muted-foreground">{fmtDate(day[0].start)}</p>
              <ul className="flex-1 space-y-1">
                {day.map((s, j) => (
                  <li key={j} className={cn("flex items-center gap-2 rounded-md border px-2 py-1 text-xs", s.status === "proposed" && "border-dashed")}>
                    <span className="font-mono tabular-nums text-muted-foreground">{fmtTime(s.start)}–{fmtTime(s.end)}</span>
                    <span className="truncate">{s.topic}</span>
                    {s.status === "proposed" && <span className="ml-auto text-[10px] text-warning">Vorschlag</span>}
                    {s.status === "done" && <span className="ml-auto text-[10px] text-success">erledigt</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      );
    case "calendar":
      return (
        <div className="space-y-3">
          {groupByDay(spec.events).map((day, i) => (
            <div key={i}>
              <p className="mb-1 text-xs font-semibold">{fmtDate(day[0].start)}</p>
              <ul className="space-y-1">
                {day.map((e, j) => (
                  <li key={j} className="flex gap-2 text-xs"><span className="w-20 font-mono tabular-nums text-muted-foreground">{fmtTime(e.start)}–{fmtTime(e.end)}</span>{e.title}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      );
    case "roadmap":
      return (
        <div className="flex gap-3 overflow-x-auto">
          {spec.phases.map((p, i) => (
            <div key={i} className="w-56 shrink-0 rounded-lg border p-3">
              <p className="text-xs font-semibold">{i + 1}. {p.title}</p>
              {(p.start || p.end) && <p className="text-[11px] text-muted-foreground">{p.start ? fmtDate(p.start) : "…"} – {p.end ? fmtDate(p.end) : "…"}</p>}
              <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs">{p.items.map((it, j) => <li key={j}>{it}</li>)}</ul>
            </div>
          ))}
        </div>
      );
  }
}

/** Einfaches Ebenen-Layout (Topologische Tiefe per BFS) als SVG. */
function Flowchart({ spec }: { spec: Extract<VisualizationSpec, { type: "flowchart" }> }) {
  const incoming = new Map<string, number>();
  for (const n of spec.nodes) incoming.set(n.id, 0);
  for (const e of spec.edges) incoming.set(e.to, (incoming.get(e.to) ?? 0) + 1);
  const level = new Map<string, number>();
  const queue = spec.nodes.filter((n) => !incoming.get(n.id)).map((n) => n.id);
  if (!queue.length && spec.nodes[0]) queue.push(spec.nodes[0].id);
  queue.forEach((id) => level.set(id, 0));
  let guard = 0;
  while (queue.length && guard++ < 500) {
    const id = queue.shift()!;
    for (const e of spec.edges.filter((x) => x.from === id)) {
      const next = (level.get(id) ?? 0) + 1;
      if (!level.has(e.to) || (level.get(e.to)! < next && next < spec.nodes.length)) {
        level.set(e.to, next);
        queue.push(e.to);
      }
    }
  }
  spec.nodes.forEach((n) => level.has(n.id) || level.set(n.id, 0));
  const rows = new Map<number, string[]>();
  for (const n of spec.nodes) rows.set(level.get(n.id)!, [...(rows.get(level.get(n.id)!) ?? []), n.id]);
  const W = 150, H = 44, GX = 30, GY = 50;
  const maxCols = Math.max(...[...rows.values()].map((r) => r.length));
  const width = maxCols * (W + GX);
  const pos = new Map<string, { x: number; y: number }>();
  for (const [lv, ids] of rows) ids.forEach((id, i) => pos.set(id, { x: (width - ids.length * (W + GX)) / 2 + i * (W + GX) + GX / 2, y: lv * (H + GY) + 10 }));
  const height = (Math.max(...rows.keys()) + 1) * (H + GY);
  const label = new Map(spec.nodes.map((n) => [n.id, n.label]));
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="mx-auto w-full max-w-3xl" role="img" aria-label={spec.title}>
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" className="fill-muted-foreground" />
        </marker>
      </defs>
      {spec.edges.map((e, i) => {
        const a = pos.get(e.from), b = pos.get(e.to);
        if (!a || !b) return null;
        return (
          <g key={i}>
            <line x1={a.x + W / 2} y1={a.y + H} x2={b.x + W / 2} y2={b.y} className="stroke-muted-foreground" strokeWidth={1.2} markerEnd="url(#arrow)" />
            {e.label && <text x={(a.x + b.x) / 2 + W / 2 + 4} y={(a.y + H + b.y) / 2} className="fill-muted-foreground text-[10px]">{e.label}</text>}
          </g>
        );
      })}
      {[...pos.entries()].map(([id, p]) => (
        <g key={id}>
          <rect x={p.x} y={p.y} width={W} height={H} rx={8} className="fill-card stroke-primary" strokeWidth={1.2} />
          <foreignObject x={p.x + 4} y={p.y + 4} width={W - 8} height={H - 8}>
            <div className="flex h-full items-center justify-center text-center text-[11px] leading-tight">{label.get(id)}</div>
          </foreignObject>
        </g>
      ))}
    </svg>
  );
}
