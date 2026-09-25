import { z } from "zod";
import { db } from "@/lib/database/prisma";
import { CAPABILITIES, hasScopes, type CapabilityId } from "@/lib/integrations/catalog";
import { isWebSearchConfigured } from "@/lib/integrations/web/search";
import type { ToolSpec } from "@/lib/ai/types";
import { calendarTools, examTools } from "./calendar";
import { documentTools, emailTools, memoryTools, onenoteTools, utilityTools, webTools } from "./knowledge";
import { planTool } from "./plan";
import { projectTools, reminderTools, taskTools } from "./productivity";
import { toWireName, type AnyTool } from "./types";

export const ALL_TOOLS: AnyTool[] = [
  planTool,
  ...taskTools,
  ...projectTools,
  ...reminderTools,
  ...calendarTools,
  ...examTools,
  ...emailTools,
  ...documentTools,
  ...onenoteTools,
  ...webTools,
  ...memoryTools,
  ...utilityTools,
];

const byName = new Map(ALL_TOOLS.map((t) => [t.name, t]));
export const getTool = (name: string) => byName.get(name);

const schemaCache = new Map<string, Record<string, unknown>>();
export function toolJsonSchema(tool: AnyTool): Record<string, unknown> {
  let schema = schemaCache.get(tool.name);
  if (!schema) {
    const { $schema: _ignored, ...rest } = z.toJSONSchema(tool.inputSchema, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
    schema = rest;
    schemaCache.set(tool.name, schema);
  }
  return schema;
}

export function toolSpecs(tools: AnyTool[]): ToolSpec[] {
  return tools.map((t) => ({ name: toWireName(t.name), description: t.description, inputSchema: toolJsonSchema(t) }));
}

export interface CapabilityStatus {
  id: CapabilityId;
  label: string;
  connected: boolean;
  status: "CONNECTED" | "EXPIRED" | "ERROR" | "DISCONNECTED" | "NOT_CONFIGURED";
  autonomyMode: "SAFE" | "ASSISTED" | "AUTONOMOUS";
  account?: string | null;
  lastSyncAt?: Date | null;
  lastError?: string | null;
}

export async function getCapabilityStatus(userId: string): Promise<CapabilityStatus[]> {
  const integrations = await db.integration.findMany({ where: { userId } });
  return CAPABILITIES.map((c) => {
    if (c.connect === "server-key") {
      const ok = c.id === "web-search" ? isWebSearchConfigured() : false;
      return { id: c.id, label: c.label, connected: ok, status: ok ? "CONNECTED" : "NOT_CONFIGURED", autonomyMode: "ASSISTED" } as CapabilityStatus;
    }
    const i = integrations.find((x) => x.provider === c.provider);
    const connected = Boolean(i && i.status === "CONNECTED" && (c.scopes.length === 0 || hasScopes(i.scopes, c.scopes)));
    const status: CapabilityStatus["status"] = !i || (!connected && i.status === "CONNECTED") ? "DISCONNECTED" : i.status;
    return {
      id: c.id,
      label: c.label,
      connected,
      status: connected ? "CONNECTED" : status === "CONNECTED" ? "DISCONNECTED" : status,
      autonomyMode: i?.autonomyMode ?? "ASSISTED",
      account: i?.externalAccountEmail,
      lastSyncAt: i?.lastSyncAt,
      lastError: i?.lastError,
    };
  });
}

/** Tools, die dem Modell angeboten werden: nur verbundene Integrationen (spart Tokens, verhindert sinnlose Aufrufe). */
export function toolsForCapabilities(status: CapabilityStatus[]): AnyTool[] {
  const connected = new Set(status.filter((s) => s.connected).map((s) => s.id));
  return ALL_TOOLS.filter((t) => {
    if (!t.capability) return true;
    // Kalender-Tools funktionieren auch ohne Google (App-Kalender)
    if (t.capability === "google-calendar") return true;
    return connected.has(t.capability);
  });
}
