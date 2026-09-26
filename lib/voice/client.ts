"use client";

/**
 * Client-Voice-Layer: Mikrofon → Speech-to-Text → (Agent) → Text-to-Speech.
 * Vom Agenten getrennt: liefert nur Text an den Chat bzw. liest Antworten vor.
 */

export type SttMode = "server" | "browser" | "none";

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function detectSttMode(serverStt: boolean): SttMode {
  if (typeof window === "undefined") return "none";
  if (serverStt && typeof MediaRecorder !== "undefined" && "mediaDevices" in navigator) return "server";
  if (getRecognitionCtor()) return "browser";
  return "none";
}

export interface VoiceSession {
  stop(): void;
}

/** Browser-Spracherkennung (Web Speech API). */
export function startBrowserRecognition(opts: { lang?: string; onText: (text: string, final: boolean) => void; onEnd: () => void; onError: (msg: string) => void }): VoiceSession {
  const Ctor = getRecognitionCtor();
  if (!Ctor) throw new Error("Spracherkennung wird von diesem Browser nicht unterstützt.");
  const rec = new Ctor();
  rec.lang = opts.lang ?? "de-DE";
  rec.interimResults = true;
  rec.continuous = false;
  rec.onresult = (e) => {
    let text = "";
    let final = false;
    for (let i = 0; i < e.results.length; i++) {
      text += e.results[i][0].transcript;
      final = e.results[i].isFinal;
    }
    opts.onText(text, final);
  };
  rec.onerror = (e) => opts.onError(e.error === "not-allowed" ? "Mikrofonzugriff verweigert." : `Spracherkennung: ${e.error}`);
  rec.onend = opts.onEnd;
  rec.start();
  return { stop: () => rec.stop() };
}

/** Aufnahme für serverseitige Transkription. */
export async function startRecording(): Promise<{ stop(): Promise<Blob> }> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recorder = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  recorder.start();
  return {
    stop: () =>
      new Promise<Blob>((resolve) => {
        recorder.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
        };
        recorder.stop();
      }),
  };
}

/** Text-to-Speech über den Browser (Markdown-Zeichen werden entfernt). */
export function speak(text: string, lang = "de-DE") {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  window.speechSynthesis.cancel();
  const clean = text.replace(/[*_`#>]/g, "").replace(/\[(\d+)\]/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  const u = new SpeechSynthesisUtterance(clean);
  u.lang = lang;
  window.speechSynthesis.speak(u);
  return true;
}

export function stopSpeaking() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}
