import { z } from "zod";
import { api, parseBody } from "@/lib/http/api";
import { setMilestoneDone } from "@/lib/projects/service";

export const PATCH = api<{ id: string }>(async ({ req, user, params }) => {
  const { done } = await parseBody(req, z.object({ done: z.boolean() }));
  return { milestone: await setMilestoneDone(user.id, params.id, done) };
});
