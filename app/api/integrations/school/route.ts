import { z } from "zod";
import { api, parseBody } from "@/lib/http/api";
import { connectSchoolIcs, syncSchool } from "@/lib/integrations/school/sync";

export const runtime = "nodejs";

export const POST = api(async ({ req, user }) => {
  const { icsUrl, platformName } = await parseBody(req, z.object({ icsUrl: z.string().min(8).max(2000), platformName: z.string().max(100).optional() }));
  const preview = await connectSchoolIcs(user.id, icsUrl.trim(), platformName);
  const sync = await syncSchool(user.id);
  return { preview, sync };
});
