import { db } from "@/lib/database/prisma";
import type { Job } from "@/lib/generated/prisma/client";
import { Prisma } from "@/lib/generated/prisma/client";

/**
 * DB-basierte Job-Queue (Postgres `FOR UPDATE SKIP LOCKED`).
 * Mehrere Worker können parallel laufen, ohne Jobs doppelt auszuführen.
 */

export interface EnqueueOptions {
  userId?: string | null;
  runAt?: Date;
  dedupeKey?: string;
  maxAttempts?: number;
}

export async function enqueue(type: string, payload: Record<string, unknown>, opts: EnqueueOptions = {}): Promise<Job | null> {
  try {
    return await db.job.create({
      data: {
        type,
        payload: payload as Prisma.InputJsonValue,
        userId: opts.userId ?? null,
        runAt: opts.runAt ?? new Date(),
        dedupeKey: opts.dedupeKey ?? null,
        maxAttempts: opts.maxAttempts ?? 3,
      },
    });
  } catch (err) {
    // Doppelter dedupeKey → Job existiert bereits
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return null;
    throw err;
  }
}

export async function claimJobs(workerId: string, limit = 5): Promise<Job[]> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    UPDATE "Job" SET status = 'RUNNING', "lockedAt" = now(), "lockedBy" = ${workerId}, attempts = attempts + 1, "updatedAt" = now()
    WHERE id IN (
      SELECT id FROM "Job"
      WHERE status = 'QUEUED' AND "runAt" <= now()
      ORDER BY "runAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id`;
  if (!rows.length) return [];
  return db.job.findMany({ where: { id: { in: rows.map((r) => r.id) } } });
}

export async function completeJob(id: string) {
  await db.job.update({ where: { id }, data: { status: "SUCCEEDED", lockedAt: null, lastError: null } });
}

/** Exponentielles Backoff: 1 min, 4 min, 16 min … */
export async function failJob(job: Job, error: string) {
  const retry = job.attempts < job.maxAttempts;
  await db.job.update({
    where: { id: job.id },
    data: {
      status: retry ? "QUEUED" : "FAILED",
      lastError: error.slice(0, 2000),
      lockedAt: null,
      runAt: retry ? new Date(Date.now() + 60_000 * 4 ** (job.attempts - 1)) : job.runAt,
    },
  });
}

/** Hängengebliebene Jobs (Worker-Absturz) wieder freigeben. */
export async function releaseStaleJobs(olderThanMs = 15 * 60_000) {
  await db.job.updateMany({
    where: { status: "RUNNING", lockedAt: { lt: new Date(Date.now() - olderThanMs) } },
    data: { status: "QUEUED", lockedAt: null, lockedBy: null },
  });
}
