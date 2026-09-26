import { api, parseBody } from "@/lib/http/api";
import { deleteTask, getTask, taskPatchSchema, updateTask } from "@/lib/tasks/service";

export const GET = api<{ id: string }>(async ({ user, params }) => ({ task: await getTask(user.id, params.id) }));
export const PATCH = api<{ id: string }>(async ({ req, user, params }) => ({ task: await updateTask(user.id, params.id, await parseBody(req, taskPatchSchema)) }));
export const DELETE = api<{ id: string }>(async ({ user, params }) => {
  await deleteTask(user.id, params.id);
  return { ok: true };
});
