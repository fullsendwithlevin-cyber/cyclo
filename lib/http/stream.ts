import { toErrorInfo } from "@/lib/errors";
import type { AgentEvent, EventSink } from "@/lib/agents/orchestrator";

/** NDJSON-Stream für Agent-Events. Läuft serverseitig weiter, auch wenn der Client abbricht. */
export function agentEventStream(run: (emit: EventSink) => Promise<unknown>): Response {
  const encoder = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream({
    start(controller) {
      const emit = (e: AgentEvent | { type: "done" }) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
        } catch {
          closed = true;
        }
      };
      run(emit)
        .catch((err) => emit({ type: "error", error: toErrorInfo(err, "Agent") }))
        .finally(() => {
          emit({ type: "done" });
          if (!closed) {
            closed = true;
            controller.close();
          }
        });
    },
    cancel() {
      closed = true;
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
}
