"use client";

import { useState } from "react";
import { Notice } from "@/components/ui/feedback";
import { PageHeader, Tabs } from "@/components/ui/page-header";
import { AutomationSettings } from "./automations";
import { IntegrationSettings } from "./integrations";
import { NotificationSettings } from "./notifications";
import { PermissionSettings } from "./permissions";
import { ProfileSettings } from "./profile";

type Tab = "integrations" | "permissions" | "automations" | "notifications" | "profile";

export function SettingsView({ error, connected, initialTab }: { error?: string; connected?: string; initialTab?: string }) {
  const [tab, setTab] = useState<Tab>((initialTab as Tab) ?? "integrations");
  return (
    <div className="space-y-4">
      <PageHeader title="Einstellungen" />
      {error && <Notice tone="warning">{error}</Notice>}
      {connected && <Notice>{connected === "google" ? "Google" : "Microsoft"} wurde erfolgreich verbunden.</Notice>}
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: "integrations", label: "Integrationen" },
          { value: "permissions", label: "Berechtigungen" },
          { value: "automations", label: "Automationen" },
          { value: "notifications", label: "Benachrichtigungen" },
          { value: "profile", label: "Profil & Zeiten" },
        ]}
      />
      {tab === "integrations" && <IntegrationSettings />}
      {tab === "permissions" && <PermissionSettings />}
      {tab === "automations" && <AutomationSettings />}
      {tab === "notifications" && <NotificationSettings />}
      {tab === "profile" && <ProfileSettings />}
    </div>
  );
}
