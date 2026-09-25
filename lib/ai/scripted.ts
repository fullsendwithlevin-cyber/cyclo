import type { AIContent, AIMessage, AIProvider, GenerateRequest, GenerateResponse } from "./types";

/**
 * Deterministischer Test-Provider (Test-Double). Wird ausschließlich in Tests/E2E verwendet und ist
 * in Produktion über die Env-Validierung gesperrt. Er simuliert keine Benutzerdaten – er ruft nur
 * echte Tools auf, deren Ergebnisse aus der echten Datenbank kommen.
 */
export type ScriptStep = (req: GenerateRequest, turn: number) => AIContent[];

export class ScriptedProvider implements AIProvider {
  readonly id = "scripted";
  readonly model = "scripted-test";
  calls: GenerateRequest[] = [];
  constructor(private script: ScriptStep) {}

  async generate(req: GenerateRequest): Promise<GenerateResponse> {
    this.calls.push(structuredClone({ ...req, signal: undefined }));
    const content = this.script(req, this.calls.length);
    return {
      content,
      stopReason: content.some((c) => c.type === "tool_call") ? "tool_use" : "end_turn",
      model: this.model,
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }
}

let counter = 0;
export const call = (name: string, input: unknown): AIContent => ({ type: "tool_call", id: `call_${++counter}`, name: name.replace(/\./g, "__"), input });
export const text = (t: string): AIContent => ({ type: "text", text: t });

export const lastUserText = (messages: AIMessage[]) => {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "user") continue;
    const t = m.content.filter((c) => c.type === "text").map((c) => (c as { text: string }).text);
    if (t.length) return t[t.length - 1];
  }
  return "";
};

export const toolResults = (messages: AIMessage[]) =>
  messages.flatMap((m) => m.content.filter((c): c is Extract<AIContent, { type: "tool_result" }> => c.type === "tool_result"));

/** Demo-Skript für E2E-Tests: „Organisiere meine nächste Prüfung“. */
export const demoScript: ScriptStep = (req) => {
  const results = toolResults(req.messages);
  const lastUser = lastUserText(req.messages);
  const n = results.length;
  if (!/organisiere/i.test(lastUser) && n === 0) return [text(`Ich habe verstanden: „${lastUser.slice(0, 80)}“. (Test-Modus)`)];
  if (n === 0) return [call("plan.update", { steps: [{ title: "Prüfung finden", status: "running" }, { title: "Unterlagen durchsuchen", status: "pending" }, { title: "Lernplan erstellen", status: "pending" }, { title: "Lerntermine eintragen", status: "pending" }] }), call("exams.list", {})];
  const examResult = results.find((r) => r.content.includes('"subject"'));
  const examId = examResult?.content.match(/"id":"([^"]+)"/)?.[1];
  if (n === 2) {
    if (!examId) return [text("Ich habe keine anstehende Prüfung gefunden.")];
    return [call("documents.search", { query: "Prüfungsstoff" }), call("exams.planStudy", { examId, sessions: 2 })];
  }
  if (n === 4) {
    const plan = results[results.length - 1].content;
    const events = [...plan.matchAll(/"title":"(Lernen[^"]+)","start":"([^"]+)","end":"([^"]+)"/g)].map((m) => ({ title: m[1], start: m[2], end: m[3], kind: "STUDY_BLOCK" }));
    if (!events.length) return [text("Es gibt keine freien Lernzeiten bis zur Prüfung.")];
    return [call("calendar.createEvents", { events, target: "local", examId })];
  }
  return [text("Fertig: Lernplan erstellt und Lerntermine eingetragen.")];
};
