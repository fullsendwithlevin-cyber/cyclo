import { db } from "@/lib/database/prisma";

export interface AutomationDefinition {
  key: string;
  name: string;
  trigger: string;
  description: string;
  defaultEnabled: boolean;
  goal: (payload: Record<string, unknown>) => string;
}

/** Vordefinierte Automationen: Ereignis → Agent-Auftrag (läuft innerhalb der Berechtigungen). */
export const AUTOMATIONS: AutomationDefinition[] = [
  {
    key: "exam.prepare",
    name: "Neue Prüfung → Vorbereitung organisieren",
    trigger: "exam.detected",
    description: "Sucht Prüfungsstoff in Notizen/Dokumenten, erstellt einen Lernplan und bereitet Kalendertermine vor.",
    defaultEnabled: true,
    goal: (p) =>
      `Automatisch erkannt: neue Prüfung „${p.subject}: ${p.title}“ am ${p.start} (Prüfungs-ID ${p.examId}). Organisiere die Vorbereitung: relevante Notizen und Unterlagen suchen, Themen ergänzen, Lernplan erstellen, Lerntermine vorbereiten und Konflikte melden.`,
  },
  {
    key: "exam.replan",
    name: "Prüfungstermin geändert → Lernplan anpassen",
    trigger: "exam.changed",
    description: "Passt bestehende Lernblöcke an den neuen Prüfungstermin an.",
    defaultEnabled: true,
    goal: (p) =>
      `Der Termin der Prüfung ${p.subject} (ID ${p.examId}) wurde von ${p.previousStart} auf ${p.start} verschoben. Prüfe die geplanten Lernblöcke und passe den Lernplan an.`,
  },
  {
    key: "email.summarize",
    name: "Wichtige E-Mail → Zusammenfassen",
    trigger: "email.important",
    description: "Fasst wichtige E-Mails zusammen und schlägt Aufgaben/Termine vor.",
    defaultEnabled: false,
    goal: (p) =>
      `Eine wichtige E-Mail ist eingegangen (ID ${p.messageId}, Betreff „${p.subject}“, von ${p.from}). Lies sie, fasse sie kurz zusammen und erfasse daraus Aufgaben, Prüfungen oder Termine, falls eindeutig.`,
  },
];

export async function ensureDefaultAutomations(userId: string) {
  const existing = await db.automation.findMany({ where: { userId }, select: { config: true } });
  const keys = new Set(existing.map((a) => (a.config as { key?: string })?.key));
  const missing = AUTOMATIONS.filter((a) => !keys.has(a.key));
  if (missing.length)
    await db.automation.createMany({
      data: missing.map((a) => ({ userId, name: a.name, trigger: a.trigger, enabled: a.defaultEnabled, config: { key: a.key } })),
    });
}

export const automationByKey = (key: string) => AUTOMATIONS.find((a) => a.key === key);
