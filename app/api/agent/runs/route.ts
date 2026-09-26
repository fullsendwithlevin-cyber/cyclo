import { db } from "@/lib/database/prisma";
import { api } from "@/lib/http/api";

export const GET = api(async ({ user, req }) => {
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 20), 100);
  const runs = await db.agentRun.findMany({
    where: { userId: user.id },
    orderBy: { startedAt: "desc" },
    take: limit,
    select: {
      id: true,
      goal: true,
      trigger: true,
      status: true,
      startedAt: true,
      finishedAt: true,
      conversationId: true,
      error: true,
      steps: { orderBy: { index: "asc" }, select: { title: true, status: true } },
      toolCalls: { orderBy: { createdAt: "asc" }, select: { id: true, toolName: true, status: true, permission: true, durationMs: true, error: true, createdAt: true } },
    },
  });
  return { runs };
});
