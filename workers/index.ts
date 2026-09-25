import "dotenv/config";
import { hostname } from "node:os";
import { claimJobs, completeJob, failJob, releaseStaleJobs } from "@/lib/jobs/queue";
import { JOB_HANDLERS } from "@/lib/jobs/handlers";
import { schedulerTick } from "@/lib/jobs/scheduler";
import { formatError, toErrorInfo } from "@/lib/errors";
import { logger } from "@/lib/observability/audit";

/**
 * Hintergrund-Worker: führt Jobs aus der DB-Queue aus und stößt jede Minute den Scheduler an.
 * Start: `npm run worker`. Mehrere Instanzen sind möglich (SKIP LOCKED).
 */
const WORKER_ID = `${hostname()}:${process.pid}`;
const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? 3);
let stopping = false;
let lastTick = 0;

async function runOnce() {
  if (Date.now() - lastTick > 60_000) {
    lastTick = Date.now();
    await releaseStaleJobs();
    await schedulerTick().catch((err) => logger.error("scheduler.failed", { error: String(err) }));
  }
  const jobs = await claimJobs(WORKER_ID, CONCURRENCY);
  await Promise.all(
    jobs.map(async (job) => {
      const handler = JOB_HANDLERS[job.type];
      const started = Date.now();
      try {
        if (!handler) throw new Error(`Kein Handler für Job-Typ ${job.type}`);
        await handler((job.payload ?? {}) as Record<string, unknown>, job);
        await completeJob(job.id);
        logger.info("job.done", { type: job.type, id: job.id, ms: Date.now() - started });
      } catch (err) {
        const msg = formatError(toErrorInfo(err, job.type));
        await failJob(job, msg);
        logger.warn("job.failed", { type: job.type, id: job.id, attempt: job.attempts, error: msg });
      }
    }),
  );
  return jobs.length;
}

async function main() {
  logger.info("worker.started", { worker: WORKER_ID, concurrency: CONCURRENCY });
  while (!stopping) {
    const n = await runOnce().catch((err) => {
      logger.error("worker.loop_failed", { error: String(err) });
      return 0;
    });
    if (!n) await new Promise((r) => setTimeout(r, 2000));
  }
  logger.info("worker.stopped", { worker: WORKER_ID });
  process.exit(0);
}

for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => (stopping = true));
void main();
