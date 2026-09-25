import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { transcribeWithOpenAI } from "@/lib/ai/openai";

/**
 * Voice-Layer (getrennt vom Agenten): Mikrofon → STT → Agent → Text → TTS.
 * Serverseitige STT nutzt OpenAI (falls konfiguriert); sonst verwendet der Client die
 * Web Speech API des Browsers. TTS erfolgt im Browser (speechSynthesis).
 */
export const isServerSttConfigured = () => Boolean(env().OPENAI_API_KEY);

export async function transcribe(audio: File): Promise<string> {
  if (!isServerSttConfigured())
    throw new AppError({
      code: "NOT_CONFIGURED",
      action: "Spracherkennung",
      reason: "Serverseitige Spracherkennung ist nicht konfiguriert.",
      solution: "OPENAI_API_KEY setzen oder die Spracherkennung des Browsers nutzen.",
    });
  return transcribeWithOpenAI(env().OPENAI_API_KEY!, env().OPENAI_TRANSCRIBE_MODEL, audio);
}
