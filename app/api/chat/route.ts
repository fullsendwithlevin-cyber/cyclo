import { z } from "zod";
import { startChatRun } from "@/lib/agents/orchestrator";
import { loadAttachments } from "@/lib/agents/attachments";
import { api, parseBody } from "@/lib/http/api";
import { agentEventStream } from "@/lib/http/stream";

export const runtime = "nodejs";
export const maxDuration = 300;

const bodySchema = z.object({
  conversationId: z.string().nullish(),
  message: z.string().trim().min(1).max(20_000),
  attachmentIds: z.array(z.string()).max(10).optional(),
});

export const POST = api(
  async ({ req, user }) => {
    const body = await parseBody(req, bodySchema);
    const attachments = body.attachmentIds?.length ? await loadAttachments(user.id, body.attachmentIds) : [];
    return agentEventStream((emit) =>
      startChatRun({ userId: user.id, conversationId: body.conversationId, message: body.message, attachments, onEvent: emit }),
    );
  },
  { rateLimit: "chat" },
);
