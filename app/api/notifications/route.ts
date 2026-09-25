import { db } from "@/lib/database/prisma";
import { api } from "@/lib/http/api";
import { listNotifications } from "@/lib/notifications/service";

export const GET = api(async ({ user, req }) => {
  const [notifications, unread] = await Promise.all([
    listNotifications(user.id, req.nextUrl.searchParams.get("unread") === "1"),
    db.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);
  return { notifications, unread };
});
