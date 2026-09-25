import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";

export function Section({ title, icon, href, children, className, action }: { title: string; icon?: ReactNode; href?: string; children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <Card className={className}>
      <CardHeader
        title={title}
        icon={icon}
        action={
          action ??
          (href && (
            <Link href={href} className="flex items-center text-xs text-muted-foreground hover:text-foreground">
              Alle <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          ))
        }
      />
      <CardBody>{children}</CardBody>
    </Card>
  );
}
