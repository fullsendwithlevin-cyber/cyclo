import webpush from "web-push";
import nodemailer from "nodemailer";
import { db } from "@/lib/database/prisma";
import { env } from "@/lib/env";
import { Prisma } from "@/lib/generated/prisma/client";
import type { NotificationPriority } from "@/lib/generated/prisma/enums";
import { logger } from "@/lib/observability/audit";
import { getUserSettings } from "@/lib/users/settings";

export interface NotifyInput {
  title: string;
  body: string;
  priority?: NotificationPriority;
  category: string;
  link?: string;
  dedupeKey?: string;
}

const PUSH_PRIORITIES: NotificationPriority[] = ["CRITICAL", "IMPORTANT"];

export const isPushConfigured = () => Boolean(env().VAPID_PUBLIC_KEY && env().VAPID_PRIVATE_KEY && env().VAPID_SUBJECT);
export const isEmailConfigured = () => Boolean(env().SMTP_URL && env().SMTP_FROM);

/** In-App-Benachrichtigung + (je nach Priorität und Einstellungen) Push/E-Mail. */
export async function notify(userId: string, input: NotifyInput) {
  let notification;
  try {
    notification = await db.notification.create({
      data: {
        userId,
        title: input.title.slice(0, 200),
        body: input.body.slice(0, 2000),
        priority: input.priority ?? "NORMAL",
        category: input.category,
        link: input.link ?? null,
        dedupeKey: input.dedupeKey ?? null,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return null;
    throw err;
  }

  if (PUSH_PRIORITIES.includes(notification.priority)) {
    const settings = await getUserSettings(userId);
    if (settings.pushNotifications && isPushConfigured()) await sendPush(userId, notification.id, input).catch((e) => logger.warn("push.failed", { error: String(e) }));
    if (settings.emailNotifications && isEmailConfigured()) await sendEmail(userId, notification.id, input).catch((e) => logger.warn("email.failed", { error: String(e) }));
  }
  return notification;
}

async function sendPush(userId: string, notificationId: string, input: NotifyInput) {
  const e = env();
  webpush.setVapidDetails(e.VAPID_SUBJECT!, e.VAPID_PUBLIC_KEY!, e.VAPID_PRIVATE_KEY!);
  const subs = await db.pushSubscription.findMany({ where: { userId } });
  const payload = JSON.stringify({ title: input.title, body: input.body, link: input.link ?? "/" });
  let delivered = false;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600 });
      delivered = true;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await db.pushSubscription.delete({ where: { id: s.id } });
    }
  }
  if (delivered) await db.notification.update({ where: { id: notificationId }, data: { pushedAt: new Date() } });
}

async function sendEmail(userId: string, notificationId: string, input: NotifyInput) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const transport = nodemailer.createTransport(env().SMTP_URL!);
  await transport.sendMail({
    from: env().SMTP_FROM,
    to: user.email,
    subject: input.title,
    text: `${input.body}\n\n${input.link ? env().APP_URL + input.link : env().APP_URL}`,
  });
  await db.notification.update({ where: { id: notificationId }, data: { emailedAt: new Date() } });
}

export const listNotifications = (userId: string, unreadOnly = false) =>
  db.notification.findMany({
    where: { userId, readAt: unreadOnly ? null : undefined },
    orderBy: [{ readAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }],
    take: 100,
  });

export const markRead = (userId: string, ids: string[] | "all") =>
  db.notification.updateMany({
    where: { userId, readAt: null, id: ids === "all" ? undefined : { in: ids } },
    data: { readAt: new Date() },
  });
