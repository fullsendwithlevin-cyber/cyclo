"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ErrorBox, SkeletonList } from "@/components/ui/feedback";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { apiFetch, ApiError, useApi } from "@/lib/client/api";
import type { UserSettings } from "@/lib/users/settings";

interface Me {
  user: { name: string | null; email: string; timezone: string };
  settings: UserSettings;
}

const DAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

export function ProfileSettings() {
  const { data, error, isLoading, mutate } = useApi<Me>("/api/me");
  if (isLoading || !data) return error ? <ErrorBox error={error} onRetry={() => mutate()} /> : <SkeletonList rows={4} />;
  return <ProfileForm me={data} onSaved={() => mutate()} />;
}

function ProfileForm({ me, onSaved }: { me: Me; onSaved: () => void }) {
  const [form, setForm] = useState({ name: me.user.name ?? "", timezone: me.user.timezone, settings: me.settings });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<ApiError | null>(null);
  const toast = useToast();

  const s = form.settings;
  const setS = (patch: Partial<UserSettings>) => setForm({ ...form, settings: { ...s, ...patch } });
  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await apiFetch("/api/me", { method: "PATCH", body: { name: form.name, timezone: form.timezone, settings: { workHours: s.workHours, study: s.study } } });
      toast("Gespeichert");
      onSaved();
    } catch (e) {
      setSaveError(e as ApiError);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <ErrorBox error={saveError} />
      <Card>
        <CardHeader title="Profil" />
        <CardBody className="grid gap-3 sm:grid-cols-2">
          <div><Label htmlFor="pf-name">Name</Label><Input id="pf-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div>
            <Label htmlFor="pf-tz">Zeitzone</Label>
            <Input id="pf-tz" value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} list="tz-list" />
            <datalist id="tz-list">{["Europe/Zurich", "Europe/Berlin", "Europe/Vienna", "Europe/London", "America/New_York"].map((t) => <option key={t} value={t} />)}</datalist>
          </div>
          <p className="text-xs text-muted-foreground sm:col-span-2">{me.user.email}</p>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Arbeitszeiten" description="Werden bei der Lernplanung als belegt betrachtet, wenn sie im Kalender stehen." />
        <CardBody className="space-y-3">
          <div className="grid max-w-sm grid-cols-2 gap-3">
            <div><Label htmlFor="wh-s">Beginn</Label><Input id="wh-s" type="time" value={s.workHours.start} onChange={(e) => setS({ workHours: { ...s.workHours, start: e.target.value } })} /></div>
            <div><Label htmlFor="wh-e">Ende</Label><Input id="wh-e" type="time" value={s.workHours.end} onChange={(e) => setS({ workHours: { ...s.workHours, end: e.target.value } })} /></div>
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Arbeitstage">
            {DAYS.map((d, i) => {
              const on = s.workHours.days.includes(i);
              return (
                <button key={d} type="button" aria-pressed={on} onClick={() => setS({ workHours: { ...s.workHours, days: on ? s.workHours.days.filter((x) => x !== i) : [...s.workHours.days, i].sort() } })} className={`h-8 w-10 rounded-lg border text-sm ${on ? "border-primary bg-accent text-accent-foreground" : "bg-card text-muted-foreground"}`}>
                  {d}
                </button>
              );
            })}
          </div>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Lernen" description="Grundlage für Lernpläne und Empfehlungen." />
        <CardBody className="grid gap-3 sm:grid-cols-4">
          <div><Label htmlFor="st-s">Lernfenster ab</Label><Input id="st-s" type="time" value={s.study.windowStart} onChange={(e) => setS({ study: { ...s.study, windowStart: e.target.value } })} /></div>
          <div><Label htmlFor="st-e">bis</Label><Input id="st-e" type="time" value={s.study.windowEnd} onChange={(e) => setS({ study: { ...s.study, windowEnd: e.target.value } })} /></div>
          <div><Label htmlFor="st-b">Blocklänge (min)</Label><Input id="st-b" type="number" min={15} max={240} value={s.study.blockMinutes} onChange={(e) => setS({ study: { ...s.study, blockMinutes: Number(e.target.value) } })} /></div>
          <div><Label htmlFor="st-m">Max. Blöcke/Tag</Label><Input id="st-m" type="number" min={1} max={8} value={s.study.maxBlocksPerDay} onChange={(e) => setS({ study: { ...s.study, maxBlocksPerDay: Number(e.target.value) } })} /></div>
        </CardBody>
      </Card>
      <Button onClick={save} loading={saving}>Speichern</Button>
    </div>
  );
}
