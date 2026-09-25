/**
 * Provider-neutrale Typen. Anwendungscode spricht ausschließlich mit `AIProvider`,
 * nie direkt mit einem Hersteller-SDK.
 */

export type AIContent =
  | { type: "text"; text: string }
  | { type: "image"; mediaType: "image/png" | "image/jpeg" | "image/gif" | "image/webp"; data: string }
  | { type: "document"; mediaType: "application/pdf"; data: string; filename?: string }
  | { type: "tool_call"; id: string; name: string; input: unknown }
  | { type: "tool_result"; toolCallId: string; content: string; isError?: boolean }
  /** Provider-spezifischer Block (z. B. Thinking), der unverändert zurückgespielt werden muss. */
  | { type: "opaque"; provider: string; block: unknown };

export interface AIMessage {
  role: "user" | "assistant";
  content: AIContent[];
}

export interface ToolSpec {
  /** Muss ^[a-zA-Z0-9_-]{1,64}$ entsprechen. */
  name: string;
  description: string;
  /** JSON-Schema des Tool-Inputs */
  inputSchema: Record<string, unknown>;
}

export type StopReason = "end_turn" | "tool_use" | "max_tokens" | "refusal" | "pause" | "other";

export interface GenerateRequest {
  system: string;
  messages: AIMessage[];
  tools?: ToolSpec[];
  maxTokens?: number;
  /** Aufwand/Qualität – wird auf Provider-Parameter abgebildet. */
  effort?: "low" | "medium" | "high";
  signal?: AbortSignal;
}

export interface GenerateResponse {
  content: AIContent[];
  stopReason: StopReason;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}

export interface AIProvider {
  readonly id: string;
  readonly model: string;
  generate(req: GenerateRequest): Promise<GenerateResponse>;
}

export interface EmbeddingProvider {
  readonly id: string;
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}

export const textOf = (content: AIContent[]) =>
  content
    .filter((c): c is Extract<AIContent, { type: "text" }> => c.type === "text")
    .map((c) => c.text)
    .join("");

export const toolCallsOf = (content: AIContent[]) =>
  content.filter((c): c is Extract<AIContent, { type: "tool_call" }> => c.type === "tool_call");
