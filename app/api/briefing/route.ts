import { api } from "@/lib/http/api";
import { buildDailyBriefing, briefingToText } from "@/lib/briefing/daily";

export const GET = api(async ({ user }) => {
  const briefing = await buildDailyBriefing(user.id);
  return { briefing, text: briefingToText(briefing, user.timezone) };
});
