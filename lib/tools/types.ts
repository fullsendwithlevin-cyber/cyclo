import type { ZodType } from "zod";
import type { CapabilityId } from "@/lib/integrations/catalog";
import type { PermissionCategory } from "@/lib/permissions/policy";
import type { VisualizationSpec } from "@/lib/visualization/types";

export interface SourceRef {
  /** z. B. "document", "onenote", "email", "calendar", "task", "exam", "web", "memory" */
  kind: string;
  id: string;
  title: string;
  url?: string;
  snippet?: string;
  /** z. B. Seitenzahl */
  location?: string;
}

export type ToolScope = "internal" | "external";

export interface ToolContext {
  userId: string;
  runId: string;
  timezone: string;
  now: Date;
}

export interface ToolResult<O = unknown> {
  /** Strukturierte Daten für das Modell */
  data: O;
  /** Einzeiler für die Aktivitätsanzeige */
  summary: string;
  sources?: SourceRef[];
  visualization?: VisualizationSpec;
  /** true, wenn das Ergebnis nach der Aktion erneut gelesen und bestätigt wurde */
  verified?: boolean;
  /** Enthält Inhalte aus externen, nicht vertrauenswürdigen Quellen */
  untrusted?: boolean;
}

export interface AgentTool<I = unknown, O = unknown> {
  /** Interner Name, z. B. "calendar.createEvent" */
  name: string;
  /** Anzeigename für Aktivität/Bestätigung, z. B. "Kalendertermin erstellen" */
  title: string;
  description: string;
  inputSchema: ZodType<I>;
  permission: PermissionCategory;
  /** internal = nur App-Datenbank, external = Fremdsystem (kann vom Input abhängen) */
  scope: ToolScope | ((input: I) => ToolScope);
  /** Integration, von der das Tool abhängt (für Autonomie-Modus + Verfügbarkeit) */
  capability?: CapabilityId;
  /** Kurzbeschreibung der konkreten Aktion für den Bestätigungsdialog */
  describe?(input: I): string;
  execute(input: I, ctx: ToolContext): Promise<ToolResult<O>>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyTool = AgentTool<any, any>;

export function defineTool<I, O>(tool: AgentTool<I, O>): AgentTool<I, O> {
  return tool;
}

/** Tool-Namen dürfen bei den Providern keine Punkte enthalten. */
export const toWireName = (name: string) => name.replace(/\./g, "__");
export const fromWireName = (wire: string) => wire.replace(/__/g, ".");

export const resolveScope = <I>(tool: AgentTool<I>, input: I): ToolScope =>
  typeof tool.scope === "function" ? tool.scope(input) : tool.scope;
