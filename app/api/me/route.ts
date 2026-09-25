import { z } from "zod";
import { db } from "@/lib/database/prisma";
import { isAIConfigured } from "@/lib/ai";
import { env } from "@/lib/env";
import { api, parseBody } from "@/lib/http/api";
import { isEmailConfigured, isPushConfigured } from "@/lib/notifications/service";
import { getUserSettings, updateUserSettings, userSettingsSchema } from "@/lib/users/settings";

export const GET = api(async ({ user }) => ({
  user,
  settings: await getUserSettings(user.id),
  server: {
    aiConfigured: isAIConfigured(),
    aiProvider: env().AI_PROVIDER,
    pushConfigured: isPushConfigured(),
    vapidPublicKey: env().VAPID_PUBLIC_KEY ?? null,
    emailConfigured: isEmailConfigured(),
    speechToText: Boolean(env().OPENAI_API_KEY),
  },
}));

const patchSchema = z.object({
  name: z.string().max(100).optional(),
  timezone: z
    .string()
    .refine((tz) => {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, "Unbekannte Zeitzone")
    .optional(),
  settings: userSettingsSchema.partial().optional(),
});

export const PATCH = api(async ({ req, user }) => {
  const body = await parseBody(req, patchSchema);
  if (body.name !== undefined || body.timezone !== undefined)
    await db.user.update({ where: { id: user.id }, data: { name: body.name, timezone: body.timezone } });
  const settings = body.settings ? await updateUserSettings(user.id, body.settings) : await getUserSettings(user.id);
  return { ok: true, settings };
});
