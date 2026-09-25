import { z } from "zod";
import { api, parseBody } from "@/lib/http/api";
import { addMilestone } from "@/lib/projects/service";

export const POST = api<{ id: string }>(async ({ req, user, params }) => {
  const { title, dueDate } = await parseBody(req, z.object({ title: z.string().trim().min(1).max(200), dueDate: z.coerce.date().nullish() }));
  return { milestone: await addMilestone(user.id, params.id, title, dueDate) };
});
