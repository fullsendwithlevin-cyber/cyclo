import { z } from "zod";
import { db } from "@/lib/database/prisma";

const time = z.string().regex(/^\d{2}:\d{2}$/);

export const userSettingsSchema = z.object({
  defaultAutonomy: z.enum(["SAFE", "ASSISTED", "AUTONOMOUS"]).default("ASSISTED"),
  workHours: z
    .object({ start: time.default("08:00"), end: time.default("17:00"), days: z.array(z.number().int().min(0).max(6)).default([1, 2, 3, 4, 5]) })
    .default({ start: "08:00", end: "17:00", days: [1, 2, 3, 4, 5] }),
  study: z
    .object({
      windowStart: time.default("18:00"),
      windowEnd: time.default("21:30"),
      blockMinutes: z.number().int().min(15).max(240).default(45),
      maxBlocksPerDay: z.number().int().min(1).max(8).default(2),
    })
    .default({ windowStart: "18:00", windowEnd: "21:30", blockMinutes: 45, maxBlocksPerDay: 2 }),
  /** Mindest-Relevanz (0..1), ab der proaktive Benachrichtigungen erzeugt werden. */
  notificationThreshold: z.number().min(0).max(1).default(0.6),
  dailyBriefingTime: time.default("07:00"),
  dailyBriefingEnabled: z.boolean().default(true),
  emailNotifications: z.boolean().default(false),
  pushNotifications: z.boolean().default(false),
});

export type UserSettings = z.infer<typeof userSettingsSchema>;

export function parseSettings(raw: unknown): UserSettings {
  const parsed = userSettingsSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : userSettingsSchema.parse({});
}

export async function getUserSettings(userId: string): Promise<UserSettings> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { settings: true } });
  return parseSettings(user.settings);
}

export async function updateUserSettings(userId: string, patch: Partial<UserSettings>): Promise<UserSettings> {
  const current = await getUserSettings(userId);
  const next = userSettingsSchema.parse({ ...current, ...patch });
  await db.user.update({ where: { id: userId }, data: { settings: next } });
  return next;
}
