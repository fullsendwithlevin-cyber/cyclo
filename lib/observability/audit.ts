import { db } from "@/lib/database/prisma";
import type { Actor } from "@/lib/generated/prisma/enums";
import { redact } from "./redact";

export async function audit(entry: {
  userId?: string | null;
  actor: Actor;
  action: string;
  target?: string;
  metadata?: Record<string, unknown>;
  ip?: string | null;
}) {
  try {
    await db.auditLog.create({
      data: {
        userId: entry.userId ?? null,
        actor: entry.actor,
        action: entry.action,
        target: entry.target,
        metadata: (redact(entry.metadata ?? {}) ?? {}) as object,
        ip: entry.ip ?? null,
      },
    });
  } catch (err) {
    // Audit darf die eigentliche Aktion nie abbrechen – aber sichtbar bleiben.
    console.error("[audit] konnte nicht geschrieben werden:", err instanceof Error ? err.message : err);
  }
}

export const logger = {
  info: (msg: string, meta?: Record<string, unknown>) => console.info(JSON.stringify({ level: "info", msg, ...(redact(meta ?? {}) as object) })),
  warn: (msg: string, meta?: Record<string, unknown>) => console.warn(JSON.stringify({ level: "warn", msg, ...(redact(meta ?? {}) as object) })),
  error: (msg: string, meta?: Record<string, unknown>) => console.error(JSON.stringify({ level: "error", msg, ...(redact(meta ?? {}) as object) })),
};
