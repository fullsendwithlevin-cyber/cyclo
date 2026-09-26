import { randomBytes } from "node:crypto";
import { config } from "dotenv";

config({ quiet: true });
if (process.env.DATABASE_URL) {
  const url = new URL(process.env.DATABASE_URL);
  if (!url.pathname.endsWith("_test")) url.pathname = `${url.pathname}_test`;
  process.env.DATABASE_URL = url.toString();
}
process.env.TOKEN_ENCRYPTION_KEY ??= randomBytes(32).toString("base64");
process.env.APP_URL = "http://localhost:3000";
process.env.UPLOAD_DIR = "./storage/test-uploads";
// Tests nutzen nie echte KI-/Google-Zugänge
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENAI_API_KEY;
delete process.env.GOOGLE_CLIENT_ID;
delete process.env.BRAVE_SEARCH_API_KEY;
