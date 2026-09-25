"use client";

import { ArrowUp, Loader2, MessageSquarePlus, Paperclip, Sparkles, Volume2, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MessagePart } from "@/lib/agents/orchestrator";
import type { ErrorInfo } from "@/lib/errors";
import { apiFetch, streamNdjson, useApi, ApiError } from "@/lib/client/api";
import { fmtDate } from "@/lib/client/format";
import { speak } from "@/lib/voice/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorBox, Notice, SkeletonList } from "@/components/ui/feedback";
import { RunSteps } from "@/components/agent/run-steps";
import { Markdown } from "./markdown";
import { PartsView, ToolActivity } from "./message-parts";
import { VoiceButton } from "./voice-button";

interface ChatMessage {
  id: string;
  role: "USER" | "ASSISTANT" | "SYSTEM";
  content: string;
  parts: MessagePart[];
  agentRunId?: string | null;
  createdAt: string;
}

interface ConversationData {
  conversation: { id: string; title: string };
  messages: ChatMessage[];
  toolCallStatus: Record<string, string>;
  runs: { id: string; status: string; steps: { title: string; status: string }[] }[];
}

interface LiveRun {
  steps: { title: string; status: string }[];
  tools: Extract<MessagePart, { type: "tool" }>[];
}

interface Me {
  server: { aiConfigured: boolean; speechToText: boolean };
}

const SUGGESTIONS = ["Was habe ich heute zu tun?", "Organisiere meine nächste Prüfung.", "Mach mir aus meinen Notizen eine Lernübersicht.", "Trag morgen um 19 Uhr eine Stunde Lernen ein."];

export function ChatView({ conversationId: initialId, initialQuery }: { conversationId: string | null; initialQuery?: string }) {
  const [conversationId, setConversationId] = useState<string | null>(initialId);
  const { data, error, isLoading, mutate } = useApi<ConversationData>(conversationId ? `/api/conversations/${conversationId}` : null);
  const { data: me } = useApi<Me>("/api/me");
  const { data: list, mutate: mutateList } = useApi<{ conversations: { id: string; title: string; updatedAt: string; agentRuns: { id: string }[] }[] }>("/api/conversations");

  const [pending, setPending] = useState<ChatMessage[]>([]);
  const [live, setLive] = useState<LiveRun | null>(null);
  const [runError, setRunError] = useState<ErrorInfo | null>(null);
  const [statusOverride, setStatusOverride] = useState<Record<string, string>>({});
  const [input, setInput] = useState("");
  const [interim, setInterim] = useState("");
  const [attachments, setAttachments] = useState<{ id: string; filename: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [cite, setCite] = useState<{ messageId: string; n: number } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const sentInitial = useRef(false);

  const messages = [...(data?.messages ?? []), ...pending.filter((p) => !data?.messages.some((m) => m.id === p.id))];
  const toolCallStatus = { ...(data?.toolCallStatus ?? {}), ...statusOverride };
  const busy = live !== null;
  const stepsByRun = new Map((data?.runs ?? []).map((r) => [r.id, r.steps]));

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, live?.tools.length, live?.steps]);

  const handleEvent = useCallback(
    (e: Record<string, unknown>) => {
      switch (e.type) {
        case "run":
          if (e.conversationId && !conversationId) {
            setConversationId(e.conversationId as string);
            window.history.replaceState(null, "", `/chat/${e.conversationId}`);
          }
          break;
        case "steps":
          setLive((l) => (l ? { ...l, steps: e.steps as LiveRun["steps"] } : l));
          break;
        case "tool":
          setLive((l) => (l ? { ...l, tools: [...l.tools, e.part as LiveRun["tools"][number]] } : l));
          break;
        case "message":
          setPending((p) => [...p, { id: (e.messageId as string) || `local-${Date.now()}`, role: "ASSISTANT", content: e.content as string, parts: e.parts as MessagePart[], createdAt: new Date().toISOString() }]);
          break;
        case "error":
          setRunError(e.error as ErrorInfo);
          break;
      }
    },
    [conversationId],
  );

  const runStream = async (path: string, body: unknown) => {
    setLive({ steps: [], tools: [] });
    setRunError(null);
    try {
      await streamNdjson(path, body, handleEvent);
    } catch (err) {
      setRunError(err instanceof ApiError ? err : { code: "INTERNAL", action: "Nachricht senden", reason: (err as Error).message });
    } finally {
      setLive(null);
      await mutate();
      setPending([]);
      void mutateList();
    }
  };

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    setInput("");
    setInterim("");
    const atts = attachments;
    setAttachments([]);
    setPending((p) => [
      ...p,
      { id: `local-user-${Date.now()}`, role: "USER", content: message, parts: atts.map((a) => ({ type: "attachment" as const, documentId: a.id, filename: a.filename, mimeType: "" })), createdAt: new Date().toISOString() },
    ]);
    await runStream("/api/chat", { conversationId, message, attachmentIds: atts.map((a) => a.id) });
  };

  const decide = async (toolCallId: string, approve: boolean) => {
    setStatusOverride((s) => ({ ...s, [toolCallId]: approve ? "RUNNING" : "REJECTED" }));
    await runStream(`/api/agent/tool-calls/${toolCallId}`, { approve });
    setStatusOverride((s) => {
      const { [toolCallId]: _, ...rest } = s;
      return rest;
    });
  };

  useEffect(() => {
    if (initialQuery && !initialId && !sentInitial.current) {
      sentInitial.current = true;
      void send(initialQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery, initialId]);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files).slice(0, 5)) {
        const form = new FormData();
        form.set("file", file);
        const res = await apiFetch<{ document: { id: string; filename: string } }>("/api/documents", { form });
        setAttachments((a) => [...a, { id: res.document.id, filename: res.document.filename }]);
      }
    } catch (err) {
      setRunError(err instanceof ApiError ? err : { code: "INTERNAL", action: "Datei hochladen", reason: (err as Error).message });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="-mx-4 -mt-4 flex h-[calc(100dvh-3.5rem-4rem)] md:-mx-6 md:-mt-6 md:h-[calc(100dvh-3.5rem)]">
      {/* Unterhaltungen */}
      <aside className="hidden w-64 shrink-0 flex-col border-r lg:flex">
        <div className="p-3">
          <Link href="/chat" className="flex h-9 items-center justify-center gap-2 rounded-lg border bg-card text-sm hover:bg-muted">
            <MessageSquarePlus className="h-4 w-4" /> Neuer Chat
          </Link>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3 scrollbar-thin" aria-label="Unterhaltungen">
          {list?.conversations.map((c) => (
            <Link key={c.id} href={`/chat/${c.id}`} className={cn("flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-muted", c.id === conversationId && "bg-muted font-medium")}>
              <span className="min-w-0 flex-1 truncate">{c.title}</span>
              {c.agentRuns.length > 0 && <span className="h-2 w-2 rounded-full bg-warning" title="Wartet auf Bestätigung" />}
            </Link>
          ))}
          {list && !list.conversations.length && <p className="px-3 py-2 text-xs text-muted-foreground">Noch keine Unterhaltungen.</p>}
        </nav>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8">
          <div className="mx-auto max-w-3xl space-y-6">
            {me && !me.server.aiConfigured && (
              <Notice tone="warning">
                Kein KI-Provider konfiguriert. Setze <code>ANTHROPIC_API_KEY</code> (oder <code>AI_PROVIDER=openai</code> + <code>OPENAI_API_KEY</code>), damit der Assistent antworten kann.
              </Notice>
            )}
            {conversationId && isLoading && <SkeletonList rows={4} />}
            <ErrorBox error={error} onRetry={() => mutate()} />

            {!conversationId && !messages.length && (
              <div className="flex flex-col items-center pt-10 text-center">
                <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                  <Sparkles className="h-6 w-6" />
                </span>
                <h1 className="text-xl font-semibold tracking-tight">Was soll ich für dich erledigen?</h1>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">Ich sehe deine Termine, Aufgaben, Prüfungen und Unterlagen, plane, handle innerhalb deiner Berechtigungen und berichte.</p>
                <div className="mt-6 grid w-full max-w-xl gap-2 sm:grid-cols-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => send(s)} className="rounded-xl border bg-card p-3 text-left text-sm hover:bg-muted">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) =>
              m.role === "USER" ? (
                <div key={m.id} className="flex flex-col items-end gap-1">
                  <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm whitespace-pre-wrap text-primary-foreground">{m.content}</div>
                  {m.parts.length > 0 && <PartsView parts={m.parts} toolCallStatus={toolCallStatus} onDecide={decide} />}
                </div>
              ) : (
                <article key={m.id} className="group flex gap-3">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                    <Sparkles className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1 space-y-3">
                    {m.agentRunId && (stepsByRun.get(m.agentRunId)?.length ?? 0) > 0 && (
                      <RunSteps steps={stepsByRun.get(m.agentRunId)!} className="rounded-lg border bg-muted/20 p-3" />
                    )}
                    <Markdown text={m.content} onCite={(n) => setCite({ messageId: m.id, n })} />
                    <PartsView parts={m.parts} toolCallStatus={toolCallStatus} onDecide={decide} highlight={cite?.messageId === m.id ? cite.n : null} />
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      <span>{fmtDate(m.createdAt)}</span>
                      <button onClick={() => speak(m.content)} className="rounded p-1 hover:bg-muted" aria-label="Vorlesen">
                        <Volume2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </article>
              ),
            )}

            {live && (
              <div className="flex gap-3" aria-live="polite">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                </span>
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="text-sm text-muted-foreground">Arbeite daran …</p>
                  {live.steps.length > 0 && <RunSteps steps={live.steps} className="rounded-lg border p-3" />}
                  <ToolActivity parts={live.tools} />
                </div>
              </div>
            )}
            <ErrorBox error={runError} />
            <div ref={bottomRef} />
          </div>
        </div>

        {/* Eingabe */}
        <div className="border-t bg-background/90 px-4 py-3 backdrop-blur md:px-8">
          <form
            className="mx-auto max-w-3xl"
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
          >
            {attachments.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {attachments.map((a) => (
                  <span key={a.id} className="inline-flex items-center gap-1 rounded-md border bg-card px-2 py-1 text-xs">
                    <Paperclip className="h-3 w-3" /> {a.filename}
                    <button type="button" onClick={() => setAttachments((x) => x.filter((y) => y.id !== a.id))} aria-label={`${a.filename} entfernen`}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-end gap-1 rounded-2xl border bg-card p-1.5 shadow-sm focus-within:ring-2 focus-within:ring-ring/30">
              <input ref={fileRef} type="file" multiple hidden accept=".pdf,.docx,.xlsx,.pptx,.txt,.md,.csv,.png,.jpg,.jpeg,.webp,.gif" onChange={(e) => upload(e.target.files)} />
              <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Datei oder Bild anhängen">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
              </button>
              <textarea
                value={interim || input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void send(input);
                  }
                }}
                rows={1}
                placeholder="Nachricht, Auftrag oder Frage …"
                className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-1 py-2 text-sm outline-none"
                aria-label="Nachricht"
              />
              <VoiceButton serverStt={Boolean(me?.server.speechToText)} onText={setInterim} onFinal={(t) => (setInterim(""), setInput((v) => (v ? `${v} ${t}` : t)))} />
              <Button type="submit" size="icon" className="h-9 w-9 rounded-xl" disabled={busy || !input.trim()} aria-label="Senden">
                <ArrowUp className="h-4 w-4" />
              </Button>
            </div>
            <p className="mt-1.5 text-center text-[11px] text-muted-foreground">Aktionen wie Senden oder Löschen werden nur nach deiner Bestätigung ausgeführt.</p>
          </form>
        </div>
      </section>
    </div>
  );
}

export function ChatEmpty() {
  return <EmptyState title="Unterhaltung nicht gefunden" />;
}
