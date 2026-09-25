import { getBusyIntervals } from "@/lib/calendar/service";
import { findFreeSlots } from "@/lib/calendar/slots";
import { api } from "@/lib/http/api";
import { getUserSettings } from "@/lib/users/settings";

export const GET = api(async ({ user, req }) => {
  const sp = req.nextUrl.searchParams;
  const settings = await getUserSettings(user.id);
  const from = new Date(sp.get("from") ?? Date.now());
  const to = new Date(sp.get("to") ?? Date.now() + 7 * 864e5);
  const { busy, warnings } = await getBusyIntervals(user.id, { start: from, end: to }, user.timezone);
  const slots = findFreeSlots({
    range: { start: from, end: to },
    busy,
    window: { start: sp.get("windowStart") ?? settings.study.windowStart, end: sp.get("windowEnd") ?? settings.study.windowEnd },
    durationMinutes: Number(sp.get("minutes") ?? settings.study.blockMinutes),
    timezone: user.timezone,
    maxSlots: 20,
  });
  return { slots, warnings };
});
