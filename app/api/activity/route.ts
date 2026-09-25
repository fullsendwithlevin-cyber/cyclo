import { db } from "@/lib/database/prisma";
import { api } from "@/lib/http/api";

export const GET = api(async ({ user }) => {
  const [toolCalls, audit] = await Promise.all([
    db.toolCall.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 100, include: { run: { select: { goal: true, trigger: true, conversationId: true } } } }),
    db.auditLog.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  return { toolCalls, audit };
});
