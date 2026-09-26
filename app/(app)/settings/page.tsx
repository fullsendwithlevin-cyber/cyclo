import { SettingsView } from "@/components/settings/settings-view";

export const metadata = { title: "Einstellungen" };
export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; connected?: string; tab?: string }> }) {
  const sp = await searchParams;
  return <SettingsView error={sp.error} connected={sp.connected} initialTab={sp.tab} />;
}
