import { z } from "zod";
import { api, parseBody } from "@/lib/http/api";
import { markRead } from "@/lib/notifications/service";

export const POST = api(async ({ req, user }) => {
  const { ids } = await parseBody(req, z.object({ ids: z.union([z.array(z.string()).max(500), z.literal("all")]) }));
  const res = await markRead(user.id, ids);
  return { updated: res.count };
});
