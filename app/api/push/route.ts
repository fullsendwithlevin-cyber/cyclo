import { z } from "zod";
import { db } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors";
import { api, parseBody } from "@/lib/http/api";
import { isPushConfigured } from "@/lib/notifications/service";
import { updateUserSettings } from "@/lib/users/settings";

const sub = z.object({ endpoint: z.string().url().startsWith("https://"), keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }) });

export const POST = api(async ({ req, user }) => {
  if (!isPushConfigured()) throw new AppError({ code: "NOT_CONFIGURED", action: "Push aktivieren", reason: "Push ist auf dem Server nicht konfiguriert.", solution: "VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT setzen." });
  const s = await parseBody(req, sub);
  await db.pushSubscription.upsert({ where: { endpoint: s.endpoint }, create: { userId: user.id, endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth }, update: { userId: user.id, p256dh: s.keys.p256dh, auth: s.keys.auth } });
  await updateUserSettings(user.id, { pushNotifications: true });
  return { ok: true };
});

export const DELETE = api(async ({ user }) => {
  await db.pushSubscription.deleteMany({ where: { userId: user.id } });
  await updateUserSettings(user.id, { pushNotifications: false });
  return { ok: true };
});
