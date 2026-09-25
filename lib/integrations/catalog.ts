import type { IntegrationProvider } from "@/lib/generated/prisma/enums";

/** Fachliche Fähigkeiten, die über eine Integration freigeschaltet werden. */
export type CapabilityId = "google-calendar" | "gmail" | "google-drive" | "onenote" | "school" | "web-search";

export interface CapabilityDefinition {
  id: CapabilityId;
  label: string;
  description: string;
  provider: IntegrationProvider;
  /** OAuth-Scopes (nur bei OAuth-Providern). */
  scopes: string[];
  connect: "oauth" | "ics-url" | "server-key";
}

export const GOOGLE_SCOPES = {
  calendar: ["https://www.googleapis.com/auth/calendar.readonly", "https://www.googleapis.com/auth/calendar.events"],
  gmail: [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.compose",
    "https://www.googleapis.com/auth/gmail.send",
  ],
  drive: ["https://www.googleapis.com/auth/drive.readonly"],
};

export const MICROSOFT_SCOPES = { onenote: ["offline_access", "User.Read", "Notes.Read"] };

export const CAPABILITIES: CapabilityDefinition[] = [
  {
    id: "google-calendar",
    label: "Google Calendar",
    description: "Termine lesen, erstellen, ändern, löschen; Frei/Belegt-Abfragen.",
    provider: "GOOGLE",
    scopes: GOOGLE_SCOPES.calendar,
    connect: "oauth",
  },
  {
    id: "gmail",
    label: "Gmail",
    description: "E-Mails suchen, lesen, zusammenfassen; Entwürfe erstellen; Senden nur mit Bestätigung.",
    provider: "GOOGLE",
    scopes: GOOGLE_SCOPES.gmail,
    connect: "oauth",
  },
  {
    id: "google-drive",
    label: "Google Drive",
    description: "Dateien finden und zur Analyse importieren (nur lesend).",
    provider: "GOOGLE",
    scopes: GOOGLE_SCOPES.drive,
    connect: "oauth",
  },
  {
    id: "onenote",
    label: "OneNote",
    description: "Notizbücher, Abschnitte und Seiten über Microsoft Graph durchsuchen und indexieren.",
    provider: "MICROSOFT",
    scopes: MICROSOFT_SCOPES.onenote,
    connect: "oauth",
  },
  {
    id: "school",
    label: "Schulplattform (iCal/ICS)",
    description:
      "Prüfungen und Termine über den offiziellen Kalender-Export (ICS-Link) der Schulplattform, z. B. ADING, importieren.",
    provider: "SCHOOL_ICS",
    scopes: [],
    connect: "ics-url",
  },
  {
    id: "web-search",
    label: "Websuche (Brave Search API)",
    description: "Websuche für Recherchen. Wird serverseitig per API-Key konfiguriert.",
    provider: "WEB_SEARCH",
    scopes: [],
    connect: "server-key",
  },
];

export const getCapability = (id: string) => CAPABILITIES.find((c) => c.id === id);

export const hasScopes = (granted: string[], needed: string[]) => needed.every((s) => granted.includes(s));
