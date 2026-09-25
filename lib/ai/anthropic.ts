import Anthropic from "@anthropic-ai/sdk";
import { AppError } from "@/lib/errors";
import type { AIContent, AIMessage, AIProvider, GenerateRequest, GenerateResponse, StopReason } from "./types";

type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface AnthropicProviderOptions {
  apiKey: string;
  model: string;
  effort: Effort;
  /** Serverseitige Refusal-Fallbacks (Beta `server-side-fallback-2026-07-01`). */
  fallbacks: boolean;
}

export class AnthropicProvider implements AIProvider {
  readonly id = "anthropic";
  readonly model: string;
  private client: Anthropic;

  constructor(private opts: AnthropicProviderOptions) {
    this.model = opts.model;
    this.client = new Anthropic({ apiKey: opts.apiKey });
  }

  async generate(req: GenerateRequest): Promise<GenerateResponse> {
    try {
      const stream = this.client.beta.messages.stream(
        {
          model: this.model,
          max_tokens: req.maxTokens ?? 32000,
          system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
          messages: req.messages.map(toAnthropicMessage),
          tools: req.tools?.map((t) => ({
            name: t.name,
            description: t.description,
            input_schema: t.inputSchema as Anthropic.Beta.BetaTool.InputSchema,
          })),
          thinking: { type: "adaptive" },
          output_config: { effort: req.effort ?? this.opts.effort },
          ...(this.opts.fallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
        },
        { signal: req.signal },
      );
      const msg = await stream.finalMessage();
      return {
        content: fromAnthropicContent(msg.content),
        stopReason: mapStop(msg.stop_reason),
        model: msg.model,
        usage: { inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens },
      };
    } catch (err) {
      throw mapAnthropicError(err);
    }
  }
}

function toAnthropicMessage(m: AIMessage): Anthropic.Beta.BetaMessageParam {
  const blocks: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const c of m.content) {
    switch (c.type) {
      case "text":
        if (c.text) blocks.push({ type: "text", text: c.text });
        break;
      case "image":
        blocks.push({ type: "image", source: { type: "base64", media_type: c.mediaType, data: c.data } });
        break;
      case "document":
        blocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: c.data } });
        break;
      case "tool_call":
        blocks.push({ type: "tool_use", id: c.id, name: c.name, input: c.input as Record<string, unknown> });
        break;
      case "tool_result":
        blocks.push({ type: "tool_result", tool_use_id: c.toolCallId, content: c.content, is_error: c.isError });
        break;
      case "opaque":
        // Thinking-Blöcke müssen unverändert zurückgegeben werden; fremde Provider-Blöcke entfallen.
        if (c.provider === "anthropic") blocks.push(c.block as Anthropic.Beta.BetaContentBlockParam);
        break;
    }
  }
  return { role: m.role, content: blocks };
}

function fromAnthropicContent(content: Anthropic.Beta.BetaContentBlock[]): AIContent[] {
  const out: AIContent[] = [];
  for (const b of content) {
    if (b.type === "text") out.push({ type: "text", text: b.text });
    else if (b.type === "tool_use") out.push({ type: "tool_call", id: b.id, name: b.name, input: b.input });
    else out.push({ type: "opaque", provider: "anthropic", block: b });
  }
  return out;
}

function mapStop(reason: string | null): StopReason {
  switch (reason) {
    case "end_turn":
    case "stop_sequence":
      return "end_turn";
    case "tool_use":
      return "tool_use";
    case "max_tokens":
      return "max_tokens";
    case "refusal":
      return "refusal";
    case "pause_turn":
      return "pause";
    default:
      return "other";
  }
}

function mapAnthropicError(err: unknown): unknown {
  if (err instanceof AppError) return err;
  const action = "KI-Anfrage (Anthropic)";
  if (err instanceof Anthropic.AuthenticationError)
    return new AppError({ code: "NOT_CONFIGURED", action, reason: "Der Anthropic-API-Key ist ungültig.", solution: "ANTHROPIC_API_KEY prüfen." });
  if (err instanceof Anthropic.RateLimitError)
    return new AppError({ code: "RATE_LIMITED", action, reason: "Das Anthropic-Ratenlimit ist erreicht.", solution: "Kurz warten und erneut versuchen." });
  if (err instanceof Anthropic.BadRequestError)
    return new AppError({ code: "INTEGRATION_ERROR", action, reason: `Anfrage abgelehnt: ${err.message}` });
  if (err instanceof Anthropic.APIConnectionError)
    return new AppError({ code: "INTEGRATION_ERROR", action, reason: "Keine Verbindung zur Anthropic-API.", solution: "Netzwerk prüfen." });
  if (err instanceof Anthropic.APIError)
    return new AppError({ code: "INTEGRATION_ERROR", action, reason: `Anthropic-Fehler ${err.status ?? ""}: ${err.message}` });
  return err;
}
