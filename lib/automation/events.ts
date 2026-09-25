import { db } from "@/lib/database/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { enqueue } from "@/lib/jobs/queue";

/** Erzeugt ein Domain-Event (dedupliziert) und stellt die Verarbeitung in die Queue. */
export async function emitDomainEvent(userId: string, type: string, payload: Record<string, unknown>, dedupeKey?: string) {
  try {
    const event = await db.domainEvent.create({
      data: { userId, type, payload: payload as Prisma.InputJsonValue, dedupeKey: dedupeKey ?? null },
    });
    await enqueue("event.process", { eventId: event.id }, { userId, dedupeKey: `event:${event.id}` });
    return event;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return null;
    throw err;
  }
}
