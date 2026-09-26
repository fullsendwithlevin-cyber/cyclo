import { api } from "@/lib/http/api";
import { deleteNote } from "@/lib/notes/service";

export const DELETE = api<{ id: string }>(async ({ user, params }) => {
  await deleteNote(user.id, params.id);
  return { ok: true };
});
