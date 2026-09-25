import { AppError } from "@/lib/errors";
import { api } from "@/lib/http/api";
import { transcribe } from "@/lib/voice/stt";

export const runtime = "nodejs";

export const POST = api(
  async ({ req }) => {
    const form = await req.formData().catch(() => null);
    const audio = form?.get("audio");
    if (!audio || typeof audio === "string") throw new AppError({ code: "VALIDATION", action: "Spracherkennung", reason: "Keine Audiodaten." });
    if (audio.size > 20 * 1024 * 1024) throw new AppError({ code: "VALIDATION", action: "Spracherkennung", reason: "Aufnahme zu lang (max. 20 MB)." });
    return { text: await transcribe(audio) };
  },
  { rateLimit: "chat" },
);
