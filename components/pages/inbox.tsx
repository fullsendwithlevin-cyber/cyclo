"use client";

import { Bell, CheckCheck, Mail, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, ErrorBox, SkeletonList } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { toolLabel } from "@/components/agent/tool-label";
import { apiFetch, useApi } from "@/lib/client/api";
import { fmtDateTime } from "@/lib/client/format";
import { cn } from "@/lib/utils";

interface Notif {
  id: string;
  title: string;
  body: string;
  priority: "CRITICAL" | "IMPORTANT" | "NORMAL" | "LOW";
  category: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

const PRIO: Record<Notif["priority"], { label: string; tone: "danger" | "warning" | "primary" | "default" }> = {
  CRITICAL: { label: "Kritisch", tone: "danger" },
  IMPORTANT: { label: "Wichtig", tone: "warning" },
  NORMAL: { label: "Normal", tone: "primary" },
  LOW: { label: "Niedrig", tone: "default" },
};

export function InboxView() {
  const { data, error, isLoading, mutate } = useApi<{ notifications: Notif[]; unread: number }>("/api/notifications");
  const { data: dash } = useApi<{ inbox: { emails: { id: string; title: string; author: string | null; externalId: string; occurredAt: string; relevance: number; metadata: { threadId?: string; reason?: string } }[] }; pending: { id: string; toolName: string; createdAt: string; run: { conversationId: string | null; goal: string } }[] }>("/api/dashboard");

  const read = async (ids: string[] | "all") => {
    await apiFetch("/api/notifications/read", { body: { ids } });
    void mutate();
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Inbox" description="Neue relevante Informationen – nach Wichtigkeit gefiltert." actions={data?.unread ? <Button variant="outline" onClick={() => read("all")}><CheckCheck className="h-4 w-4" /> Alle gelesen</Button> : undefined} />

      {!!dash?.pending.length && (
        <Card>
          <CardHeader title="Wartet auf Bestätigung" icon={<ShieldAlert className="h-4 w-4" />} />
          <CardBody>
            <ul className="space-y-1">
              {dash.pending.map((p) => (
                <li key={p.id}>
                  <Link href={p.run.conversationId ? `/chat/${p.run.conversationId}` : "/activity"} className="flex items-center gap-2 rounded-lg p-2 text-sm hover:bg-muted">
                    <span className="font-medium">{toolLabel(p.toolName)}</span>
                    <span className="truncate text-muted-foreground">{p.run.goal}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title="Benachrichtigungen" icon={<Bell className="h-4 w-4" />} />
        <CardBody>
          <ErrorBox error={error} onRetry={() => mutate()} />
          {isLoading ? (
            <SkeletonList rows={4} />
          ) : !data?.notifications.length ? (
            <EmptyState title="Keine Benachrichtigungen" description="Der Assistent meldet sich nur bei relevanten Ereignissen (Schwelle in den Einstellungen)." />
          ) : (
            <ul className="divide-y">
              {data.notifications.map((n) => (
                <li key={n.id} className={cn("flex items-start gap-3 py-3", n.readAt && "opacity-60")}>
                  <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-primary")} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">{n.title}</p>
                      <Badge tone={PRIO[n.priority].tone}>{PRIO[n.priority].label}</Badge>
                    </div>
                    <p className="mt-0.5 text-sm whitespace-pre-line text-muted-foreground">{n.body}</p>
                    <div className="mt-1 flex gap-3 text-xs">
                      <span className="text-muted-foreground">{fmtDateTime(n.createdAt)}</span>
                      {n.link && <Link href={n.link} onClick={() => !n.readAt && read([n.id])} className="text-primary">Öffnen</Link>}
                      {!n.readAt && <button onClick={() => read([n.id])} className="text-muted-foreground hover:text-foreground">Gelesen</button>}
                      <Link href={`/chat?q=${encodeURIComponent(`Kümmere dich um: ${n.title} – ${n.body}`)}`} className="text-muted-foreground hover:text-foreground">Kümmere dich darum</Link>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Wichtige E-Mails (7 Tage)" icon={<Mail className="h-4 w-4" />} description="Aus Gmail erkannt; nur verbundene Konten." />
        <CardBody>
          {!dash?.inbox.emails.length ? (
            <EmptyState title="Keine als wichtig erkannten E-Mails" />
          ) : (
            <ul className="divide-y">
              {dash.inbox.emails.map((m) => (
                <li key={m.id} className="flex items-start gap-3 py-2">
                  <Mail className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <a href={`https://mail.google.com/mail/u/0/#all/${m.metadata.threadId ?? m.externalId}`} target="_blank" rel="noopener noreferrer" className="block truncate text-sm hover:underline">{m.title}</a>
                    <p className="truncate text-xs text-muted-foreground">{m.author} · {fmtDateTime(m.occurredAt)}{m.metadata.reason ? ` · ${m.metadata.reason}` : ""}</p>
                  </div>
                  <Link href={`/chat?q=${encodeURIComponent(`Fasse die E-Mail ${m.externalId} („${m.title}“) zusammen und sag mir, was zu tun ist.`)}`} className="text-xs text-primary">Zusammenfassen</Link>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
