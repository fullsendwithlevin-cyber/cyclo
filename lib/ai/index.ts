import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { AnthropicProvider } from "./anthropic";
import { GEMINI_BASE_URL, OpenAIEmbeddings, OpenAIProvider } from "./openai";
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
  if (e.AI_PROVIDER === "gemini") {
    if (!e.GEMINI_API_KEY) throw notConfigured("Gemini", "GEMINI_API_KEY");
    return new OpenAIProvider(e.GEMINI_API_KEY, e.GEMINI_MODEL, { baseURL: GEMINI_BASE_URL, id: "gemini" });
  }
  if (e.AI_PROVIDER === "llama")
    return new OpenAIProvider(e.LLAMA_API_KEY, e.LLAMA_MODEL, { baseURL: e.LLAMA_BASE_URL, id: "llama" });
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
  if (e.AI_PROVIDER === "gemini") return Boolean(e.GEMINI_API_KEY);
  if (e.AI_PROVIDER === "llama") return true;
  return e.AI_PROVIDER === "openai" ? Boolean(e.OPENAI_API_KEY) : Boolean(e.ANTHROPIC_API_KEY);
}

/** Embeddings sind optional: ohne Provider fällt die Suche auf Volltext zurück. */
export function getEmbeddingProvider(): EmbeddingProvider | null {
  if (embeddingOverride !== undefined) return embeddingOverride;
  const e = env();
  if (e.OPENAI_API_KEY) return new OpenAIEmbeddings(e.OPENAI_API_KEY, e.OPENAI_EMBEDDING_MODEL);
  if (e.GEMINI_API_KEY)
    return new OpenAIEmbeddings(e.GEMINI_API_KEY, e.GEMINI_EMBEDDING_MODEL, { baseURL: GEMINI_BASE_URL, id: "gemini" });
  if (e.LLAMA_EMBEDDING_MODEL)
    return new OpenAIEmbeddings(e.LLAMA_API_KEY, e.LLAMA_EMBEDDING_MODEL, { baseURL: e.LLAMA_BASE_URL, id: "llama" });
  return null;
}

function notConfigured(label: string, variable: string) {
  return new AppError({
    code: "NOT_CONFIGURED",
    action: "KI-Anfrage",
    reason: `Kein ${label}-API-Key konfiguriert.`,
    solution: `${variable} in der .env setzen (siehe docs/SETUP.md).`,
  });
}
