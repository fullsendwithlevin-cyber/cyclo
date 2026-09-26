import { z } from "zod";
import { resolveToolCall } from "@/lib/agents/orchestrator";
import { api, parseBody } from "@/lib/http/api";
import { agentEventStream } from "@/lib/http/stream";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Bestätigen/Ablehnen einer vorbereiteten Aktion (Human-in-the-Loop). */
export const POST = api<{ id: string }>(async ({ req, user, params }) => {
  const { approve } = await parseBody(req, z.object({ approve: z.boolean() }));
  return agentEventStream((emit) => resolveToolCall({ userId: user.id, toolCallId: params.id, approve, onEvent: emit }));
});
