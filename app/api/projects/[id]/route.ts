import { api, parseBody } from "@/lib/http/api";
import { deleteProject, getProject, projectPatchSchema, updateProject } from "@/lib/projects/service";

export const GET = api<{ id: string }>(async ({ user, params }) => ({ project: await getProject(user.id, params.id) }));
export const PATCH = api<{ id: string }>(async ({ req, user, params }) => ({ project: await updateProject(user.id, params.id, await parseBody(req, projectPatchSchema)) }));
export const DELETE = api<{ id: string }>(async ({ user, params }) => {
  await deleteProject(user.id, params.id);
  return { ok: true };
});
