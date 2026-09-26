import { db } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors";
import { api } from "@/lib/http/api";

export const GET = api<{ id: string }>(async ({ user, params }) => {
  const run = await db.agentRun.findFirst({
    where: { id: params.id, userId: user.id },
    select: {
      id: true,
      goal: true,
      trigger: true,
      status: true,
      tainted: true,
      provider: true,
      model: true,
      usage: true,
      error: true,
      startedAt: true,
      finishedAt: true,
      conversationId: true,
      steps: { orderBy: { index: "asc" } },
      toolCalls: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!run) throw new AppError({ code: "NOT_FOUND", action: "Agent-Lauf laden", reason: "Nicht gefunden." });
  return { run };
});
