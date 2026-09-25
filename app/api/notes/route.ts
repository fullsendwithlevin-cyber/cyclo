import { api, parseBody } from "@/lib/http/api";
import { createNote, listNotes, noteInputSchema } from "@/lib/notes/service";

export const GET = api(async ({ user, req }) => ({ notes: await listNotes(user.id, req.nextUrl.searchParams.get("projectId") ?? undefined) }));
export const POST = api(async ({ req, user }) => ({ note: await createNote(user.id, await parseBody(req, noteInputSchema)) }));
