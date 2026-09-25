"use client";

import { Bell, LogOut, Menu, Moon, Search, Sparkles, Sun } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch, useApi } from "@/lib/client/api";
import { useIsDark } from "@/lib/client/hooks";
import { cn } from "@/lib/utils";
import { CommandPalette } from "./command-palette";
import { MOBILE_NAV, NAV } from "./nav";

export interface ShellUser {
  name: string | null;
  email: string;
  image: string | null;
  timezone: string;
}

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function ThemeToggle() {
  const dark = useIsDark();
  const toggle = () => {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {}
  };
  return (
    <button onClick={toggle} className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Farbschema wechseln">
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

export function AppShell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { data: notif } = useApi<{ unread: number }>("/api/notifications?unread=1", { refreshInterval: 60_000 });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const logout = async () => {
    await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/login");
  };

  return (
    <div className="flex min-h-dvh">
      {/* Desktop-Sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r bg-card/50 md:flex">
        <Link href="/" className="flex items-center gap-2 px-5 py-4">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Sparkles className="h-4 w-4" />
          </span>
          <span className="text-sm font-semibold tracking-tight">Chief of Staff</span>
        </Link>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 scrollbar-thin" aria-label="Hauptnavigation">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(pathname, item.href) ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                isActive(pathname, item.href) ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
              {item.href === "/inbox" && !!notif?.unread && (
                <span className="ml-auto rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">{notif.unread}</span>
              )}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2 border-t px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium">{user.name ?? user.email}</p>
            <p className="truncate text-[11px] text-muted-foreground">{user.email}</p>
          </div>
          <button onClick={logout} className="rounded-lg p-2 text-muted-foreground hover:bg-muted" aria-label="Abmelden">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur md:px-6">
          <Link href="/" className="flex items-center gap-2 md:hidden" aria-label="Start">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Sparkles className="h-4 w-4" />
            </span>
          </Link>
          <button
            onClick={() => setPaletteOpen(true)}
            className="flex h-9 flex-1 items-center gap-2 rounded-lg border bg-card px-3 text-sm text-muted-foreground hover:bg-muted md:max-w-md"
          >
            <Search className="h-4 w-4" />
            <span className="truncate">Überall suchen …</span>
            <kbd className="ml-auto hidden rounded border px-1.5 text-[10px] md:inline">⌘K</kbd>
          </button>
          <div className="ml-auto flex items-center">
            <Link href="/inbox" className="relative rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Benachrichtigungen${notif?.unread ? ` (${notif.unread} ungelesen)` : ""}`}>
              <Bell className="h-4 w-4" />
              {!!notif?.unread && <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-primary" />}
            </Link>
            <ThemeToggle />
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-4 pb-24 md:px-6 md:pt-6 md:pb-10">{children}</main>
      </div>

      {/* Mobile-Bottom-Navigation */}
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 backdrop-blur md:hidden" aria-label="Navigation">
        <div className="grid grid-cols-5">
          {NAV.filter((n) => MOBILE_NAV.includes(n.href)).map((item) => (
            <Link key={item.href} href={item.href} className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px]", isActive(pathname, item.href) ? "text-primary" : "text-muted-foreground")}>
              <item.icon className="h-5 w-5" />
              {item.label}
            </Link>
          ))}
          <Link href="/more" className={cn("relative flex flex-col items-center gap-0.5 py-2 text-[11px]", pathname === "/more" ? "text-primary" : "text-muted-foreground")}>
            <Menu className="h-5 w-5" />
            Mehr
            {!!notif?.unread && <span className="absolute top-1.5 right-[30%] h-2 w-2 rounded-full bg-primary" />}
          </Link>
        </div>
      </nav>

      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
    </div>
  );
}
