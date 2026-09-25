"use client";

import { Mic, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/client/api";
import { detectSttMode, startBrowserRecognition, startRecording, type SttMode, type VoiceSession } from "@/lib/voice/client";
import { cn } from "@/lib/utils";

export function VoiceButton({ serverStt, onText, onFinal }: { serverStt: boolean; onText: (t: string) => void; onFinal: (t: string) => void }) {
  const [mode, setMode] = useState<SttMode>("none");
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const session = useRef<VoiceSession | { stop(): Promise<Blob> } | null>(null);

  useEffect(() => setMode(detectSttMode(serverStt)), [serverStt]);

  if (mode === "none")
    return (
      <button type="button" disabled className="rounded-lg p-2 text-muted-foreground opacity-40" title="Spracheingabe wird von diesem Browser nicht unterstützt und serverseitige Spracherkennung ist nicht konfiguriert." aria-label="Spracheingabe nicht verfügbar">
        <Mic className="h-4 w-4" />
      </button>
    );

  const start = async () => {
    setError(null);
    try {
      if (mode === "browser") {
        session.current = startBrowserRecognition({
          onText: (t, final) => (final ? onFinal(t) : onText(t)),
          onEnd: () => setActive(false),
          onError: (m) => (setError(m), setActive(false)),
        });
      } else {
        session.current = await startRecording();
      }
      setActive(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Mikrofon nicht verfügbar");
    }
  };

  const stop = async () => {
    const s = session.current;
    session.current = null;
    setActive(false);
    if (!s) return;
    const res = s.stop();
    if (res instanceof Promise) {
      setBusy(true);
      try {
        const blob = await res;
        const form = new FormData();
        form.set("audio", new File([blob], "aufnahme.webm", { type: blob.type }));
        const { text } = await apiFetch<{ text: string }>("/api/voice/transcribe", { form });
        if (text.trim()) onFinal(text.trim());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Transkription fehlgeschlagen");
      } finally {
        setBusy(false);
      }
    }
  };

  return (
    <span className="relative">
      <button
        type="button"
        onClick={active ? stop : start}
        disabled={busy}
        className={cn("rounded-lg p-2 transition-colors", active ? "bg-danger/15 text-danger" : "text-muted-foreground hover:bg-muted hover:text-foreground")}
        aria-label={active ? "Aufnahme beenden" : "Spracheingabe starten"}
        aria-pressed={active}
      >
        {busy ? <span className="block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : active ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
      </button>
      {error && <span role="alert" className="absolute bottom-full left-0 mb-2 w-56 rounded-md border bg-card p-2 text-xs shadow">{error}</span>}
    </span>
  );
}
