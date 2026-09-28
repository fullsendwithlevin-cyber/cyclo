import { z } from "zod";
import { db } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors";
import { api, parseBody } from "@/lib/http/api";

const STALE_RUN_MS = 15 * 60_000;

async function own(userId: string, id: string) {
  const c = await db.conversation.findFirst({ where: { id, userId } });
  if (!c) throw new AppError({ code: "NOT_FOUND", action: "Unterhaltung", reason: "Nicht gefunden." });
  return c;
}

export const GET = api<{ id: string }>(async ({ user, params }) => {
  const conversation = await own(user.id, params.id);
  const messages = await db.message.findMany({ where: { conversationId: params.id }, orderBy: { createdAt: "asc" } });
  // Aktuellen Status wartender/entschiedener Bestätigungen mitliefern
  const toolCalls = await db.toolCall.findMany({
    where: { userId: user.id, run: { conversationId: params.id } },
    select: { id: true, status: true },
  });
  const runs = await db.agentRun.findMany({
    where: { conversationId: params.id },
    select: {
      id: true,
      status: true,
      startedAt: true,
      steps: { orderBy: { index: "asc" }, select: { title: true, status: true } },
      toolCalls: { where: { confirmedAt: { not: null } }, orderBy: { confirmedAt: "desc" }, take: 1, select: { confirmedAt: true } },
    },
  });
  // Ein Run, der nach einem Neustart hängen geblieben ist, soll den Chat nicht dauerhaft blockieren
  const staleBefore = Date.now() - STALE_RUN_MS;
  return {
    conversation,
    messages,
    toolCallStatus: Object.fromEntries(toolCalls.map((t) => [t.id, t.status])),
    runs: runs.map(({ startedAt, toolCalls: confirmed, ...r }) => {
      const lastActivity = Math.max(startedAt.getTime(), confirmed[0]?.confirmedAt?.getTime() ?? 0);
      return { ...r, status: r.status === "RUNNING" && lastActivity < staleBefore ? "STALE" : r.status };
    }),
  };
});

export const PATCH = api<{ id: string }>(async ({ req, user, params }) => {
  await own(user.id, params.id);
  const { title } = await parseBody(req, z.object({ title: z.string().trim().min(1).max(200) }));
  return db.conversation.update({ where: { id: params.id }, data: { title } });
});

export const DELETE = api<{ id: string }>(async ({ user, params }) => {
  await own(user.id, params.id);
  await db.conversation.delete({ where: { id: params.id } });
  return { ok: true };
});
