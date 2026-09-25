import { api, parseBody } from "@/lib/http/api";
import { createProject, listProjects, projectInputSchema } from "@/lib/projects/service";

export const GET = api(async ({ user, req }) => ({ projects: await listProjects(user.id, req.nextUrl.searchParams.get("archived") === "1") }));
export const POST = api(async ({ req, user }) => ({ project: await createProject(user.id, await parseBody(req, projectInputSchema)) }));
