import { api } from "@/lib/http/api";
import { deleteMemory } from "@/lib/memory/service";

export const DELETE = api<{ id: string }>(async ({ user, params }) => {
  await deleteMemory(user.id, params.id);
  return { ok: true };
});
