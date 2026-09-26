import { destroySession } from "@/lib/auth/session";
import { api } from "@/lib/http/api";

export const POST = api(async () => {
  await destroySession();
  return { ok: true };
});
