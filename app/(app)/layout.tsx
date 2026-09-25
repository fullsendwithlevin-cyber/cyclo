import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { getSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return <AppShell user={{ name: user.name, email: user.email, image: user.image, timezone: user.timezone }}>{children}</AppShell>;
}
