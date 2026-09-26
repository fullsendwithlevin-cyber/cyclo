import { z } from "zod";
import { confirmProposedEvent } from "@/lib/calendar/service";
import { api, parseBody } from "@/lib/http/api";

export const POST = api<{ id: string }>(async ({ req, user, params }) => {
  const { target } = await parseBody(req, z.object({ target: z.enum(["local", "google"]) }));
  return confirmProposedEvent(user.id, params.id, user.timezone, target);
});
