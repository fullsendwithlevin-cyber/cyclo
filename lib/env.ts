import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  APP_URL: z.string().url().default("http://localhost:3000"),
  TOKEN_ENCRYPTION_KEY: z.string().min(1),
  ALLOW_DEV_LOGIN: z.enum(["true", "false"]).default("false"),

  AI_PROVIDER: z.enum(["anthropic", "openai", "scripted"]).default("anthropic"),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-opus-5"),
  ANTHROPIC_EFFORT: z.enum(["low", "medium", "high", "xhigh", "max"]).default("high"),
  ANTHROPIC_FALLBACKS: z.enum(["true", "false"]).default("true"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-5"),
  OPENAI_EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
  OPENAI_TRANSCRIBE_MODEL: z.string().default("gpt-4o-transcribe"),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  MICROSOFT_CLIENT_ID: z.string().optional(),
  MICROSOFT_CLIENT_SECRET: z.string().optional(),
  MICROSOFT_TENANT: z.string().default("common"),

  BRAVE_SEARCH_API_KEY: z.string().optional(),

  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional(),

  SMTP_URL: z.string().optional(),
  SMTP_FROM: z.string().optional(),

  UPLOAD_DIR: z.string().default("./storage/uploads"),
  MAX_UPLOAD_MB: z.coerce.number().default(25),
  CRON_SECRET: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Validiert die Umgebung beim ersten Zugriff (nicht beim Import – wichtig für `next build`). */
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Ungültige Umgebungsvariablen: ${issues}`);
  }
  if (parsed.data.AI_PROVIDER === "scripted" && parsed.data.NODE_ENV === "production")
    throw new Error("AI_PROVIDER=scripted ist nur für Tests erlaubt.");
  cached = parsed.data;
  return cached;
}

export function resetEnvCache() {
  cached = undefined;
}

export const isDevLoginEnabled = () => env().ALLOW_DEV_LOGIN === "true" && env().NODE_ENV !== "production";
