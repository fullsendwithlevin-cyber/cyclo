import { db } from "@/lib/database/prisma";
import { api } from "@/lib/http/api";

export const GET = api(async ({ user }) => ({
  conversations: await db.conversation.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: { id: true, title: true, updatedAt: true, agentRuns: { where: { status: "AWAITING_CONFIRMATION" }, select: { id: true } } },
  }),
}));
