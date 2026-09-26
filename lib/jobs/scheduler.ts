import { db } from "@/lib/database/prisma";
import { GOOGLE_SCOPES, hasScopes } from "@/lib/integrations/catalog";
import { localDateKey, parseHm, zonedParts } from "@/lib/time/zone";
import { parseSettings } from "@/lib/users/settings";
import { enqueue } from "./queue";

const slot = (now: Date, minutes: number) => Math.floor(now.getTime() / (minutes * 60_000));

/**
 * Periodische Jobs (idempotent über dedupeKey pro Zeitfenster). Wird vom Worker jede Minute
 * aufgerufen – alternativ über /api/cron (z. B. Vercel Cron) für serverlose Deployments.
 */
export async function schedulerTick(now = new Date()) {
  let enqueued = 0;
  const add = async (...args: Parameters<typeof enqueue>) => {
    if (await enqueue(...args)) enqueued++;
  };
  await add("reminders.dispatch", {}, { dedupeKey: `reminders:${slot(now, 1)}` });
  await add("maintenance.cleanup", {}, { dedupeKey: `cleanup:${slot(now, 24 * 60)}` });

  const users = await db.user.findMany({ include: { integrations: true } });
  for (const u of users) {
    await add("scan.user", { userId: u.id }, { userId: u.id, dedupeKey: `scan:${u.id}:${slot(now, 60)}` });
    for (const i of u.integrations) {
      if (i.status !== "CONNECTED") continue;
      if (i.provider === "GOOGLE" && hasScopes(i.scopes, GOOGLE_SCOPES.gmail.slice(0, 1)))
        await add("sync.gmail", { userId: u.id }, { userId: u.id, dedupeKey: `gmail:${u.id}:${slot(now, 15)}` });
      if (i.provider === "MICROSOFT" && i.scopes.includes("Notes.Read"))
        await add("sync.onenote", { userId: u.id }, { userId: u.id, dedupeKey: `onenote:${u.id}:${slot(now, 60)}` });
      if (i.provider === "SCHOOL_ICS") await add("sync.school", { userId: u.id }, { userId: u.id, dedupeKey: `school:${u.id}:${slot(now, 60)}` });
    }
    const settings = parseSettings(u.settings);
    if (settings.dailyBriefingEnabled) {
      const p = zonedParts(now, u.timezone);
      const t = parseHm(settings.dailyBriefingTime);
      if (p.hour * 60 + p.minute >= t.hour * 60 + t.minute) {
        const day = localDateKey(now, u.timezone);
        await add("briefing.daily", { userId: u.id, day }, { userId: u.id, dedupeKey: `briefing:${u.id}:${day}` });
      }
    }
  }
  return { enqueued };
}
