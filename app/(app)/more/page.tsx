import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { MOBILE_NAV, NAV } from "@/components/shell/nav";

export const metadata = { title: "Mehr" };

export default function MorePage() {
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold tracking-tight">Mehr</h1>
      <nav className="divide-y rounded-xl border bg-card">
        {NAV.filter((n) => !MOBILE_NAV.includes(n.href)).map((n) => (
          <Link key={n.href} href={n.href} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-muted">
            <n.icon className="h-4 w-4 text-muted-foreground" />
            {n.label}
            <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
          </Link>
        ))}
        <Link href="/search" className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-muted">Suche<ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" /></Link>
      </nav>
    </div>
  );
}
