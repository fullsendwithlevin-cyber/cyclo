import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { AnthropicProvider } from "./anthropic";
import { OpenAIEmbeddings, OpenAIProvider } from "./openai";
import { demoScript, ScriptedProvider } from "./scripted";
import type { AIProvider, EmbeddingProvider } from "./types";

export * from "./types";

let override: AIProvider | null = null;
let embeddingOverride: EmbeddingProvider | null | undefined;

/** Für Tests: eigenen Provider injizieren. */
export function setAIProviderForTesting(p: AIProvider | null) {
  override = p;
}
export function setEmbeddingProviderForTesting(p: EmbeddingProvider | null | undefined) {
  embeddingOverride = p;
}

export function getAIProvider(): AIProvider {
  if (override) return override;
  const e = env();
  // Nur Tests/E2E (in Produktion durch env() gesperrt)
  if (e.AI_PROVIDER === "scripted") return new ScriptedProvider(demoScript);
  if (e.AI_PROVIDER === "openai") {
    if (!e.OPENAI_API_KEY) throw notConfigured("OpenAI", "OPENAI_API_KEY");
    return new OpenAIProvider(e.OPENAI_API_KEY, e.OPENAI_MODEL);
  }
  if (!e.ANTHROPIC_API_KEY) throw notConfigured("Anthropic", "ANTHROPIC_API_KEY");
  return new AnthropicProvider({
    apiKey: e.ANTHROPIC_API_KEY,
    model: e.ANTHROPIC_MODEL,
    effort: e.ANTHROPIC_EFFORT,
    fallbacks: e.ANTHROPIC_FALLBACKS === "true",
  });
}

export function isAIConfigured(): boolean {
  if (override) return true;
  const e = env();
  if (e.AI_PROVIDER === "scripted") return true;
  return e.AI_PROVIDER === "openai" ? Boolean(e.OPENAI_API_KEY) : Boolean(e.ANTHROPIC_API_KEY);
}

/** Embeddings sind optional: ohne Provider fällt die Suche auf Volltext zurück. */
export function getEmbeddingProvider(): EmbeddingProvider | null {
  if (embeddingOverride !== undefined) return embeddingOverride;
  const e = env();
  return e.OPENAI_API_KEY ? new OpenAIEmbeddings(e.OPENAI_API_KEY, e.OPENAI_EMBEDDING_MODEL) : null;
}

function notConfigured(label: string, variable: string) {
  return new AppError({
    code: "NOT_CONFIGURED",
    action: "KI-Anfrage",
    reason: `Kein ${label}-API-Key konfiguriert.`,
    solution: `${variable} in der .env setzen (siehe docs/SETUP.md).`,
  });
}
