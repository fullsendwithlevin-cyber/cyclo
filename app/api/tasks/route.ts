import { z } from "zod";
import { TaskStatus } from "@/lib/generated/prisma/enums";
import { api, parseBody } from "@/lib/http/api";
import { createTask, listTasks, OPEN_STATUSES, taskInputSchema } from "@/lib/tasks/service";

export const GET = api(async ({ user, req }) => {
  const sp = req.nextUrl.searchParams;
  const status = sp.get("status");
  const statuses = status === "all" ? undefined : status ? (status.split(",").filter((s) => s in TaskStatus) as TaskStatus[]) : OPEN_STATUSES;
  const tasks = await listTasks(user.id, { status: statuses, projectId: sp.get("projectId") ?? undefined, search: sp.get("q") ?? undefined });
  return { tasks };
});

export const POST = api(async ({ req, user }) => {
  const input = await parseBody(req, taskInputSchema.omit({ source: true, sourceRef: true }).extend({ dependsOnIds: z.array(z.string()).optional() }));
  return { task: await createTask(user.id, { ...input, source: "MANUAL" }) };
});
