"use client";

import { AlertTriangle, CalendarDays, CheckSquare, Clock, Lightbulb } from "lucide-react";
import Link from "next/link";
import type { DailyBriefing } from "@/lib/briefing/daily";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, ErrorBox, SkeletonList } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { useApi } from "@/lib/client/api";
import { fmtLongDate, fmtTime } from "@/lib/client/format";
import { cn } from "@/lib/utils";

export function BriefingView() {
  const { data, error, isLoading, mutate } = useApi<{ briefing: DailyBriefing; text: string }>("/api/briefing");
  const b = data?.briefing;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="Tagesbriefing" description={b ? fmtLongDate(b.date) : undefined} />
      <ErrorBox error={error} onRetry={() => mutate()} />
      {b?.warnings.map((w, i) => <ErrorBox key={i} error={w} />)}
      {isLoading || !b ? (
        <SkeletonList rows={6} />
      ) : (
        <>
          <Card>
            <CardHeader title="Heute" icon={<CalendarDays className="h-4 w-4" />} />
            <CardBody>
              {b.events.length ? (
                <ul className="space-y-1.5 font-mono text-sm tabular-nums">
                  {b.events.map((e) => <li key={e.id}><span className="text-muted-foreground">{e.allDay ? "ganztägig" : fmtTime(e.start)}</span> <span className="font-sans">– {e.title}</span></li>)}
                </ul>
              ) : (
                <EmptyState title="Keine Termine" />
              )}
            </CardBody>
          </Card>
          {b.important.length > 0 && (
            <Card>
              <CardHeader title="Wichtig" icon={<AlertTriangle className="h-4 w-4" />} />
              <CardBody>
                <ul className="space-y-1.5">
                  {b.important.map((i, k) => (
                    <li key={k} className={cn("text-sm", i.level === "critical" && "font-medium text-danger")}>
                      {i.link ? <Link href={i.link} className="hover:underline">{i.text}</Link> : i.text}
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader title="Aufgaben" icon={<CheckSquare className="h-4 w-4" />} />
              <CardBody>
                {b.tasks.length ? <ul className="space-y-1 text-sm">{b.tasks.map((t) => <li key={t.id}>□ {t.title}</li>)}</ul> : <p className="text-sm text-muted-foreground">Keine offenen Aufgaben.</p>}
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Deadlines" icon={<Clock className="h-4 w-4" />} />
              <CardBody>
                {b.deadlines.length ? <ul className="space-y-1 text-sm">{b.deadlines.map((d) => <li key={d.id}>{d.title} <span className="text-muted-foreground">({fmtTime(d.dueDate)})</span></li>)}</ul> : <p className="text-sm text-muted-foreground">Keine Deadlines bis morgen.</p>}
              </CardBody>
            </Card>
          </div>
          {b.recommendations.length > 0 && (
            <Card className="border-primary/30 bg-accent/30">
              <CardHeader title="Empfehlung" icon={<Lightbulb className="h-4 w-4" />} />
              <CardBody><ul className="space-y-1 text-sm">{b.recommendations.map((r, i) => <li key={i}>{r}</li>)}</ul></CardBody>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
