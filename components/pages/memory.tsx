"use client";

import { Brain, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, ErrorBox, SkeletonList } from "@/components/ui/feedback";
import { Input, Select } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { useToast } from "@/components/ui/toast";
import { apiFetch, ApiError, useApi } from "@/lib/client/api";
import { fmtDate } from "@/lib/client/format";

interface Mem {
  id: string;
  type: "EPISODIC" | "SEMANTIC" | "TASK" | "PREFERENCE";
  content: string;
  importance: number;
  source: string;
  createdAt: string;
}

const TYPES: { type: Mem["type"]; label: string; description: string }[] = [
  { type: "PREFERENCE", label: "Präferenzen", description: "Wie du arbeitest und lernst" },
  { type: "SEMANTIC", label: "Fakten", description: "Langfristig relevante Informationen" },
  { type: "TASK", label: "Verpflichtungen", description: "Laufende Vorhaben" },
  { type: "EPISODIC", label: "Ereignisse", description: "Wichtige vergangene Ereignisse" },
];

export function MemoryView() {
  const { data, error, isLoading, mutate } = useApi<{ memories: Mem[] }>("/api/memory");
  const [form, setForm] = useState({ content: "", type: "PREFERENCE" as Mem["type"] });
  const toast = useToast();

  const add = async () => {
    try {
      await apiFetch("/api/memory", { body: { ...form, importance: 0.7 } });
      setForm({ ...form, content: "" });
      void mutate();
    } catch (e) {
      toast(e instanceof ApiError ? e.reason : "Fehler", "error");
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Gedächtnis" description="Was sich der Assistent langfristig über dich merkt. Nichts wird blind gespeichert – du kannst alles löschen." />
      <Card className="p-3">
        <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => (e.preventDefault(), add())}>
          <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as Mem["type"] })} className="sm:w-44" aria-label="Typ">
            {TYPES.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
          </Select>
          <Input value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="z. B. „Ich lerne am liebsten abends nach 19 Uhr“" aria-label="Neue Erinnerung" />
          <Button disabled={form.content.trim().length < 3}>Merken</Button>
        </form>
      </Card>
      <ErrorBox error={error} onRetry={() => mutate()} />
      {isLoading ? (
        <SkeletonList rows={4} />
      ) : !data?.memories.length ? (
        <EmptyState icon={<Brain className="h-6 w-6" />} title="Noch nichts gespeichert" description="Der Assistent merkt sich dauerhafte Präferenzen und Fakten aus Gesprächen." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {TYPES.map((t) => {
            const items = data.memories.filter((m) => m.type === t.type);
            return (
              <Card key={t.type}>
                <CardHeader title={t.label} description={t.description} />
                <CardBody>
                  {!items.length ? (
                    <p className="text-sm text-muted-foreground">Keine Einträge.</p>
                  ) : (
                    <ul className="space-y-1">
                      {items.map((m) => (
                        <li key={m.id} className="group flex items-start gap-2 rounded-lg p-1.5 hover:bg-muted">
                          <span className="min-w-0 flex-1 text-sm">{m.content}<span className="block text-[11px] text-muted-foreground">{m.source === "user" ? "von dir" : "aus Gespräch"} · {fmtDate(m.createdAt)}</span></span>
                          <button onClick={async () => (await apiFetch(`/api/memory/${m.id}`, { method: "DELETE" }), mutate())} className="rounded p-1 text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-danger" aria-label="Löschen">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
