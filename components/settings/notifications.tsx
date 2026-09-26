"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ErrorBox, SkeletonList } from "@/components/ui/feedback";
import { Input, Label, Switch } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { apiFetch, ApiError, useApi } from "@/lib/client/api";
import type { UserSettings } from "@/lib/users/settings";

interface Me {
  settings: UserSettings;
  server: { pushConfigured: boolean; vapidPublicKey: string | null; emailConfigured: boolean };
}

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function NotificationSettings() {
  const { data, error, isLoading, mutate } = useApi<Me>("/api/me");
  const toast = useToast();
  const [pushBusy, setPushBusy] = useState(false);
  if (isLoading) return <SkeletonList rows={4} />;
  if (!data) return <ErrorBox error={error} onRetry={() => mutate()} />;
  const s = data.settings;
  const save = async (patch: Partial<UserSettings>) => {
    try {
      await apiFetch("/api/me", { method: "PATCH", body: { settings: patch } });
      void mutate();
    } catch (e) {
      toast(e instanceof ApiError ? e.reason : "Fehler", "error");
    }
  };

  const enablePush = async () => {
    setPushBusy(true);
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("Push wird von diesem Browser nicht unterstützt.");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Benachrichtigungen wurden im Browser nicht erlaubt.");
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(data.server.vapidPublicKey!) });
      await apiFetch("/api/push", { body: sub.toJSON() });
      toast("Push-Benachrichtigungen aktiviert");
      void mutate();
    } catch (e) {
      toast(e instanceof ApiError ? e.reason : (e as Error).message, "error");
    } finally {
      setPushBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Relevanzschwelle" description="Nur Ereignisse ab dieser Relevanz erzeugen Benachrichtigungen – keine Meldungen für Kleinigkeiten." />
        <CardBody>
          <input type="range" min={0.3} max={0.95} step={0.05} defaultValue={s.notificationThreshold} onMouseUp={(e) => save({ notificationThreshold: Number((e.target as HTMLInputElement).value) })} onTouchEnd={(e) => save({ notificationThreshold: Number((e.target as HTMLInputElement).value) })} onKeyUp={(e) => save({ notificationThreshold: Number((e.target as HTMLInputElement).value) })} className="w-full accent-[var(--primary)]" aria-label="Relevanzschwelle" />
          <div className="flex justify-between text-xs text-muted-foreground"><span>mehr Hinweise</span><span>aktuell {Math.round(s.notificationThreshold * 100)} %</span><span>nur Wichtiges</span></div>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Tagesbriefing" />
        <CardBody className="flex flex-wrap items-center gap-4">
          <Switch checked={s.dailyBriefingEnabled} onChange={(v) => save({ dailyBriefingEnabled: v })} label="Tagesbriefing" />
          <div className="flex items-center gap-2">
            <Label htmlFor="brief-time" className="mb-0">Uhrzeit</Label>
            <Input id="brief-time" type="time" defaultValue={s.dailyBriefingTime} onBlur={(e) => save({ dailyBriefingTime: e.target.value })} className="w-28" />
          </div>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Kanäle" description="In-App ist immer aktiv. Push und E-Mail nur für kritische/wichtige Hinweise." />
        <CardBody className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Push (Browser/Handy)</p>
              {!data.server.pushConfigured && <p className="text-xs text-warning">Auf dem Server nicht konfiguriert (VAPID-Schlüssel fehlen).</p>}
            </div>
            {s.pushNotifications ? (
              <Button variant="outline" size="sm" onClick={async () => (await apiFetch("/api/push", { method: "DELETE" }), mutate())}>Deaktivieren</Button>
            ) : (
              <Button size="sm" disabled={!data.server.pushConfigured} loading={pushBusy} onClick={enablePush}>Aktivieren</Button>
            )}
          </div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">E-Mail</p>
              {!data.server.emailConfigured && <p className="text-xs text-warning">Auf dem Server nicht konfiguriert (SMTP_URL fehlt).</p>}
            </div>
            <Switch checked={s.emailNotifications} disabled={!data.server.emailConfigured} onChange={(v) => save({ emailNotifications: v })} label="E-Mail-Benachrichtigungen" />
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
