import OpenAI from "openai";
import { AppError } from "@/lib/errors";
import type { AIContent, AIMessage, AIProvider, EmbeddingProvider, GenerateRequest, GenerateResponse, StopReason } from "./types";

export class OpenAIProvider implements AIProvider {
  readonly id = "openai";
  private client: OpenAI;

  constructor(apiKey: string, readonly model: string) {
    this.client = new OpenAI({ apiKey });
  }

  async generate(req: GenerateRequest): Promise<GenerateResponse> {
    try {
      const res = await this.client.chat.completions.create(
        {
          model: this.model,
          max_completion_tokens: req.maxTokens ?? 16000,
          messages: [{ role: "system", content: req.system }, ...req.messages.flatMap(toOpenAIMessages)],
          tools: req.tools?.length
            ? req.tools.map((t) => ({
                type: "function" as const,
                function: { name: t.name, description: t.description, parameters: t.inputSchema },
              }))
            : undefined,
        },
        { signal: req.signal },
      );
      const choice = res.choices[0];
      const content: AIContent[] = [];
      if (choice?.message.content) content.push({ type: "text", text: choice.message.content });
      for (const call of choice?.message.tool_calls ?? []) {
        if (call.type !== "function") continue;
        let input: unknown = {};
        try {
          input = JSON.parse(call.function.arguments || "{}");
        } catch {
          input = { __invalid_json: call.function.arguments };
        }
        content.push({ type: "tool_call", id: call.id, name: call.function.name, input });
      }
      return {
        content,
        stopReason: mapStop(choice?.finish_reason),
        model: res.model,
        usage: { inputTokens: res.usage?.prompt_tokens ?? 0, outputTokens: res.usage?.completion_tokens ?? 0 },
      };
    } catch (err) {
      throw mapOpenAIError(err);
    }
  }
}

function toOpenAIMessages(m: AIMessage): OpenAI.Chat.ChatCompletionMessageParam[] {
  if (m.role === "assistant") {
    const text = m.content.filter((c) => c.type === "text").map((c) => (c as { text: string }).text).join("");
    const calls = m.content.filter((c) => c.type === "tool_call") as Extract<AIContent, { type: "tool_call" }>[];
    return [
      {
        role: "assistant",
        content: text || null,
        tool_calls: calls.length
          ? calls.map((c) => ({ id: c.id, type: "function" as const, function: { name: c.name, arguments: JSON.stringify(c.input) } }))
          : undefined,
      },
    ];
  }
  const out: OpenAI.Chat.ChatCompletionMessageParam[] = [];
  for (const c of m.content)
    if (c.type === "tool_result") out.push({ role: "tool", tool_call_id: c.toolCallId, content: c.content });
  const parts: OpenAI.Chat.ChatCompletionContentPart[] = [];
  for (const c of m.content) {
    if (c.type === "text" && c.text) parts.push({ type: "text", text: c.text });
    if (c.type === "image") parts.push({ type: "image_url", image_url: { url: `data:${c.mediaType};base64,${c.data}` } });
    if (c.type === "document")
      parts.push({ type: "file", file: { filename: c.filename ?? "document.pdf", file_data: `data:${c.mediaType};base64,${c.data}` } });
  }
  if (parts.length) out.push({ role: "user", content: parts });
  return out;
}

function mapStop(reason: string | null | undefined): StopReason {
  if (reason === "tool_calls") return "tool_use";
  if (reason === "stop") return "end_turn";
  if (reason === "length") return "max_tokens";
  if (reason === "content_filter") return "refusal";
  return "other";
}

function mapOpenAIError(err: unknown): unknown {
  if (err instanceof AppError) return err;
  const action = "KI-Anfrage (OpenAI)";
  if (err instanceof OpenAI.AuthenticationError)
    return new AppError({ code: "NOT_CONFIGURED", action, reason: "Der OpenAI-API-Key ist ungültig.", solution: "OPENAI_API_KEY prüfen." });
  if (err instanceof OpenAI.RateLimitError)
    return new AppError({ code: "RATE_LIMITED", action, reason: "Das OpenAI-Ratenlimit ist erreicht.", solution: "Kurz warten." });
  if (err instanceof OpenAI.APIError)
    return new AppError({ code: "INTEGRATION_ERROR", action, reason: `OpenAI-Fehler ${err.status ?? ""}: ${err.message}` });
  return err;
}

export class OpenAIEmbeddings implements EmbeddingProvider {
  readonly id = "openai";
  readonly dimensions = 1536;
  private client: OpenAI;

  constructor(apiKey: string, private model: string) {
    this.client = new OpenAI({ apiKey });
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (!texts.length) return [];
    try {
      const out: number[][] = [];
      for (let i = 0; i < texts.length; i += 96) {
        const res = await this.client.embeddings.create({
          model: this.model,
          input: texts.slice(i, i + 96).map((t) => t.slice(0, 24_000)),
          dimensions: this.dimensions,
        });
        out.push(...res.data.sort((a, b) => a.index - b.index).map((d) => d.embedding));
      }
      return out;
    } catch (err) {
      throw mapOpenAIError(err);
    }
  }
}

export async function transcribeWithOpenAI(apiKey: string, model: string, file: File): Promise<string> {
  const client = new OpenAI({ apiKey });
  try {
    const res = await client.audio.transcriptions.create({ file, model });
    return res.text;
  } catch (err) {
    throw mapOpenAIError(err);
  }
}
