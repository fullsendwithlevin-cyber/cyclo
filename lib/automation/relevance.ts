/**
 * Relevanzbewertung für Domain-Events (0..1). Nur Events oberhalb der
 * Benutzer-Schwelle erzeugen Benachrichtigungen – kein Spam bei Kleinigkeiten.
 */
export type DomainEventType =
  | "exam.detected"
  | "exam.changed"
  | "email.important"
  | "deadline.approaching"
  | "calendar.conflict"
  | "document.new"
  | "task.overdue"
  | "school.entry";

export interface RelevanceResult {
  score: number;
  reasons: string[];
}

const clamp = (n: number) => Math.max(0, Math.min(1, n));

export function scoreEvent(type: string, payload: Record<string, unknown>, now = new Date()): RelevanceResult {
  const reasons: string[] = [];
  const daysUntil = (iso: unknown) => (typeof iso === "string" ? (new Date(iso).getTime() - now.getTime()) / 864e5 : Infinity);

  switch (type) {
    case "exam.detected": {
      const d = daysUntil(payload.start);
      let s = 0.7;
      reasons.push("Neue Prüfung");
      if (d < 0) return { score: 0.1, reasons: ["Prüfung liegt in der Vergangenheit"] };
      if (d <= 14) (s += 0.2), reasons.push("in den nächsten 14 Tagen");
      if (d <= 3) (s += 0.1), reasons.push("in weniger als 3 Tagen");
      return { score: clamp(s), reasons };
    }
    case "exam.changed":
      return { score: daysUntil(payload.start) < 0 ? 0.2 : 0.9, reasons: ["Prüfungstermin wurde geändert"] };
    case "deadline.approaching": {
      const hours = daysUntil(payload.dueDate) * 24;
      if (hours < 0) return { score: 0.8, reasons: ["Deadline überschritten"] };
      return { score: clamp(1 - hours / 96), reasons: [`Deadline in ${Math.round(hours)} h`] };
    }
    case "task.overdue":
      return { score: payload.priority === "URGENT" || payload.priority === "HIGH" ? 0.85 : 0.6, reasons: ["Aufgabe überfällig"] };
    case "calendar.conflict": {
      const d = daysUntil(payload.start);
      return { score: d <= 2 ? 0.85 : d <= 7 ? 0.7 : 0.45, reasons: ["Terminkonflikt"] };
    }
    case "email.important": {
      const base = typeof payload.importance === "number" ? payload.importance : 0.5;
      return { score: clamp(base), reasons: [String(payload.reason ?? "Als wichtig eingestufte E-Mail")] };
    }
    case "school.entry":
      return { score: 0.55, reasons: ["Neuer Eintrag der Schulplattform"] };
    case "document.new":
      return { score: 0.35, reasons: ["Neues Dokument"] };
    default:
      return { score: 0.3, reasons: ["Unbekannter Ereignistyp"] };
  }
}

export function priorityForScore(score: number): "CRITICAL" | "IMPORTANT" | "NORMAL" | "LOW" {
  if (score >= 0.9) return "CRITICAL";
  if (score >= 0.75) return "IMPORTANT";
  if (score >= 0.5) return "NORMAL";
  return "LOW";
}
