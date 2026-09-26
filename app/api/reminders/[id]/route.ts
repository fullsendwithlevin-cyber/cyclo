import { api } from "@/lib/http/api";
import { deleteReminder } from "@/lib/reminders/service";

export const DELETE = api<{ id: string }>(async ({ user, params }) => {
  await deleteReminder(user.id, params.id);
  return { ok: true };
});
