import type { AutonomyMode, PermissionCategory, PermissionDecision } from "@/lib/generated/prisma/enums";

export type { AutonomyMode, PermissionCategory, PermissionDecision };

export const PERMISSION_LABELS: Record<PermissionCategory, string> = {
  READ: "Lesen",
  WRITE: "Schreiben",
  DELETE: "Löschen",
  SEND: "Senden",
  EXTERNAL_ACTION: "Externe Aktion",
  FINANCIAL: "Finanziell",
  SENSITIVE: "Sensibel",
};

export const MODE_LABELS: Record<AutonomyMode, { label: string; description: string }> = {
  SAFE: { label: "Sicher", description: "Nur Lesen passiert automatisch – jede Änderung braucht deine Bestätigung." },
  ASSISTED: {
    label: "Assistiert",
    description: "Lesen, Aufgaben und Erinnerungen automatisch; Änderungen in externen Diensten werden vorgeschlagen.",
  },
  AUTONOMOUS: {
    label: "Autonom",
    description: "Erlaubte Änderungen werden selbstständig ausgeführt. Senden, Löschen, externe Aktionen und Käufe bleiben bestätigungspflichtig.",
  },
};

/** Kategorien, die nie ohne Bestätigung laufen – egal welcher Modus. */
const ALWAYS_CONFIRM: PermissionCategory[] = ["FINANCIAL", "SENSITIVE"];
/** Kategorien, die nach Kontakt mit untrusted Inhalten immer bestätigt werden müssen. */
const TAINT_SENSITIVE: PermissionCategory[] = ["SEND", "DELETE", "EXTERNAL_ACTION", "FINANCIAL", "SENSITIVE"];

export interface PolicyInput {
  category: PermissionCategory;
  /** internal = nur eigene Datenbank; external = Änderung in einem Fremdsystem */
  scope: "internal" | "external";
  mode: AutonomyMode;
  /** Benutzer-Override für genau dieses Tool */
  override?: PermissionDecision | null;
  /** Hat der aktuelle Run untrusted Fremdinhalte gelesen? */
  tainted: boolean;
}

export interface PolicyResult {
  decision: PermissionDecision;
  reason: string;
}

/**
 * Zentrale Berechtigungsentscheidung. Läuft ausschließlich im Code –
 * das Sprachmodell kann sie nicht beeinflussen.
 */
export function decidePermission(input: PolicyInput): PolicyResult {
  const { category, scope, mode, override, tainted } = input;

  if (override === "DENY") return { decision: "DENY", reason: "In deinen Berechtigungen deaktiviert." };

  if (ALWAYS_CONFIRM.includes(category))
    return { decision: "CONFIRM", reason: `${PERMISSION_LABELS[category]}e Aktionen brauchen immer eine Bestätigung.` };

  if (tainted && TAINT_SENSITIVE.includes(category))
    return {
      decision: "CONFIRM",
      reason: "Der Auftrag enthält Inhalte aus externen Quellen – diese Aktion wird deshalb immer bestätigt.",
    };

  if (override === "CONFIRM") return { decision: "CONFIRM", reason: "Laut deinen Berechtigungen bestätigungspflichtig." };
  if (override === "ALLOW") return { decision: "ALLOW", reason: "Laut deinen Berechtigungen erlaubt." };

  if (category === "READ") return { decision: "ALLOW", reason: "Lesezugriff." };

  switch (mode) {
    case "SAFE":
      return { decision: "CONFIRM", reason: "Modus „Sicher“: Änderungen werden bestätigt." };
    case "ASSISTED":
      if (category === "WRITE" && scope === "internal") return { decision: "ALLOW", reason: "Interne Änderung (Modus „Assistiert“)." };
      return { decision: "CONFIRM", reason: "Modus „Assistiert“: Änderungen außerhalb der App werden vorgeschlagen." };
    case "AUTONOMOUS":
      if (category === "WRITE") return { decision: "ALLOW", reason: "Modus „Autonom“." };
      return { decision: "CONFIRM", reason: `${PERMISSION_LABELS[category]} ist irreversibel oder nach außen gerichtet.` };
  }
}
