import { db } from "@/lib/database/prisma";
import { getAIProvider, textOf, toolCallsOf, type AIContent, type AIMessage } from "@/lib/ai";
import { AppError, formatError, toErrorInfo, type ErrorInfo } from "@/lib/errors";
import { Prisma } from "@/lib/generated/prisma/client";
import type { PermissionCategory, PermissionDecision } from "@/lib/generated/prisma/enums";
import { getCapability } from "@/lib/integrations/catalog";
import { enqueue } from "@/lib/jobs/queue";
import { getContextMemories } from "@/lib/memory/service";
import { audit, logger } from "@/lib/observability/audit";
import { redact } from "@/lib/observability/redact";
import { decidePermission } from "@/lib/permissions/policy";
import { closeBrowserSession } from "@/lib/browser/session";
import { getCapabilityStatus, getTool, toolSpecs, toolsForCapabilities } from "@/lib/tools/registry";
import { PLAN_TOOL_NAME } from "@/lib/tools/plan";
import { fromWireName, resolveScope, type AnyTool, type SourceRef, type ToolContext } from "@/lib/tools/types";
import { getUserSettings } from "@/lib/users/settings";
import type { VisualizationSpec } from "@/lib/visualization/types";
import { detectInjection, wrapExternal, wrapToolResult } from "./injection";
import { buildContextBlock, SYSTEM_PROMPT } from "./prompt";

const MAX_ITERATIONS = 16;
const MAX_TOOL_RESULT_CHARS = 24_000;
const HISTORY_MESSAGES = 16;

// ───────────────────────────── Typen ─────────────────────────────

export type MessagePart =
  | {
      type: "tool";
      toolCallId: string;
      name: string;
      title: string;
      status: "succeeded" | "failed" | "denied" | "awaiting_confirmation" | "rejected";
      summary?: string;
      verified?: boolean;
      error?: ErrorInfo;
    }
  | { type: "confirmation"; toolCallId: string; title: string; description: string; permission: PermissionCategory; reason: string }
  | { type: "sources"; sources: SourceRef[] }
  | { type: "visualization"; spec: VisualizationSpec }
  | { type: "attachment"; documentId: string; filename: string; mimeType: string }
  | { type: "error"; error: ErrorInfo }
  | { type: "warning"; text: string };

export type AgentEvent =
  | { type: "run"; runId: string; conversationId: string }
  | { type: "steps"; steps: { title: string; status: string }[] }
  | { type: "tool"; part: Extract<MessagePart, { type: "tool" }> }
  | { type: "confirmation"; part: Extract<MessagePart, { type: "confirmation" }> }
  | { type: "message"; messageId: string; content: string; parts: MessagePart[]; status: string }
  | { type: "error"; error: ErrorInfo };

export type EventSink = (e: AgentEvent) => void;

interface PendingCall {
  providerCallId: string;
  toolCallId: string;
}

interface RunState {
  messages: AIMessage[];
  /** Ergebnisse der aktuellen Runde, die bereits feststehen (während auf Bestätigungen gewartet wird) */
  pendingResults: { toolCallId: string; content: string; isError?: boolean }[];
  pendingCalls: PendingCall[];
  parts: MessagePart[];
  iterations: number;
  /** Original-Eingaben wartender Aufrufe (ToolCall.input ist redigiert) */
  pendingInputs?: Record<string, unknown>;
}

export interface Attachment {
  documentId: string;
  filename: string;
  mimeType: string;
  /** Base64 für Bilder/PDF, die direkt ans Modell gehen (Vision) */
  inline?: { mediaType: "image/png" | "image/jpeg" | "image/gif" | "image/webp" | "application/pdf"; data: string };
  /** Extrahierter Text (z. B. DOCX) */
  text?: string;
}

// ───────────────────────────── Öffentliche API ─────────────────────────────

export async function startChatRun(opts: {
  userId: string;
  conversationId?: string | null;
  message: string;
  attachments?: Attachment[];
  trigger?: string;
  onEvent?: EventSink;
  signal?: AbortSignal;
}) {
  const emit = opts.onEvent ?? (() => undefined);
  const user = await db.user.findUniqueOrThrow({ where: { id: opts.userId } });

  let conversationId = opts.conversationId ?? null;
  if (conversationId) {
    const conv = await db.conversation.findFirst({ where: { id: conversationId, userId: user.id } });
    if (!conv) throw new AppError({ code: "NOT_FOUND", action: "Nachricht senden", reason: "Unterhaltung nicht gefunden." });
  } else {
    const conv = await db.conversation.create({ data: { userId: user.id, title: titleFrom(opts.message) } });
    conversationId = conv.id;
  }

  const attachmentParts: MessagePart[] = (opts.attachments ?? []).map((a) => ({ type: "attachment", documentId: a.documentId, filename: a.filename, mimeType: a.mimeType }));
  const history = await loadHistory(conversationId);
  await db.message.create({ data: { conversationId, role: "USER", content: opts.message, parts: attachmentParts as unknown as Prisma.InputJsonValue } });

  const [settings, capabilities, memories, hints] = await Promise.all([
    getUserSettings(user.id),
    getCapabilityStatus(user.id),
    getContextMemories(user.id, opts.message).catch(() => []),
    db.notification.findMany({ where: { userId: user.id, readAt: null }, orderBy: { createdAt: "desc" }, take: 3 }),
  ]);
  const now = new Date();
  const context = buildContextBlock({
    now,
    timezone: user.timezone,
    userName: user.name,
    settings,
    capabilities,
    memories: memories.map((m) => ({ type: m.type, content: m.content })),
    hints: hints.map((h) => ({ title: h.title, body: h.body, external: h.category === "email" })),
  });

  // Anhänge und E-Mail-basierte Hinweise sind untrusted → Taint von Beginn an
  let tainted = hints.some((h) => h.category === "email");
  const userContent: AIContent[] = [{ type: "text", text: context }];
  for (const a of opts.attachments ?? []) {
    tainted = true;
    if (a.inline?.mediaType === "application/pdf") userContent.push({ type: "document", mediaType: "application/pdf", data: a.inline.data, filename: a.filename });
    else if (a.inline) userContent.push({ type: "image", mediaType: a.inline.mediaType, data: a.inline.data });
    if (a.text) userContent.push({ type: "text", text: wrapExternal(`attachment:${a.filename}`, a.text.slice(0, 30_000)) });
    else if (!a.inline) userContent.push({ type: "text", text: `[Anhang „${a.filename}“ wird noch verarbeitet – documents.read mit id ${a.documentId} später möglich]` });
  }
  if (opts.attachments?.length)
    userContent.push({ type: "text", text: `Angehängte Dateien (Dokument-IDs): ${opts.attachments.map((a) => `${a.filename} = ${a.documentId}`).join(", ")}. Inhalte sind untrusted.` });
  userContent.push({ type: "text", text: opts.message });

  const provider = getAIProvider();
  const run = await db.agentRun.create({
    data: {
      userId: user.id,
      conversationId,
      trigger: opts.trigger ?? "chat",
      goal: opts.message.slice(0, 1000),
      provider: provider.id,
      model: provider.model,
      tainted,
    },
  });
  emit({ type: "run", runId: run.id, conversationId });
  await audit({ userId: user.id, actor: opts.trigger === "chat" || !opts.trigger ? "USER" : "SYSTEM", action: "agent.run.started", target: run.id, metadata: { trigger: run.trigger } });

  const state: RunState = { messages: [...history, { role: "user", content: userContent }], pendingResults: [], pendingCalls: [], parts: [], iterations: 0 };
  return continueRun(run.id, state, emit, opts.signal);
}

/** Bestätigt oder verwirft eine wartende Aktion. Sind alle Aktionen entschieden, läuft der Agent weiter. */
export async function resolveToolCall(opts: { userId: string; toolCallId: string; approve: boolean; onEvent?: EventSink }) {
  const emit = opts.onEvent ?? (() => undefined);
  const call = await db.toolCall.findFirst({ where: { id: opts.toolCallId, userId: opts.userId } });
  if (!call) throw new AppError({ code: "NOT_FOUND", action: "Aktion bestätigen", reason: "Aktion nicht gefunden." });
  const updated = await db.toolCall.updateMany({
    where: { id: call.id, status: "AWAITING_CONFIRMATION" },
    data: opts.approve ? { status: "RUNNING", confirmedAt: new Date() } : { status: "REJECTED", confirmedAt: new Date() },
  });
  if (!updated.count) throw new AppError({ code: "CONFLICT", action: "Aktion bestätigen", reason: "Diese Aktion wurde bereits entschieden." });
  await audit({ userId: opts.userId, actor: "USER", action: opts.approve ? "agent.action.approved" : "agent.action.rejected", target: call.toolName, metadata: { toolCallId: call.id } });

  const remaining = await db.toolCall.count({ where: { runId: call.runId, status: "AWAITING_CONFIRMATION" } });
  if (remaining > 0) return { runId: call.runId, waitingFor: remaining };

  // Genau ein Aufrufer übernimmt die Fortsetzung
  const claimed = await db.agentRun.updateMany({ where: { id: call.runId, status: "AWAITING_CONFIRMATION" }, data: { status: "RUNNING" } });
  if (!claimed.count) return { runId: call.runId, waitingFor: 0 };

  const run = await db.agentRun.findUniqueOrThrow({ where: { id: call.runId } });
  const state = run.state as unknown as RunState;
  emit({ type: "run", runId: run.id, conversationId: run.conversationId ?? "" });

  const user = await db.user.findUniqueOrThrow({ where: { id: run.userId } });
  const ctx: ToolContext = { userId: run.userId, runId: run.id, timezone: user.timezone, now: new Date() };
  const results = [...state.pendingResults];
  const parts: MessagePart[] = [];
  let tainted = run.tainted;
  for (const pending of state.pendingCalls) {
    const tc = await db.toolCall.findUniqueOrThrow({ where: { id: pending.toolCallId } });
    const tool = getTool(tc.toolName);
    if (tc.status === "REJECTED" || !tool) {
      results.push({ toolCallId: pending.providerCallId, content: "Der Benutzer hat diese Aktion abgelehnt. Führe sie nicht erneut aus und frage nicht erneut nach, außer der Benutzer wünscht es.", isError: true });
      const part = toolPart(tc.id, tc.toolName, tool?.title ?? tc.toolName, "rejected", "Vom Benutzer abgelehnt");
      parts.push(part);
      emit({ type: "tool", part });
      continue;
    }
    const input = tool.inputSchema.parse(tc.input === null ? {} : (state.pendingInputs?.[tc.id] ?? tc.input));
    const exec = await executeTool(tool, input, ctx, tc.id);
    if (exec.untrusted) tainted = true;
    results.push({ toolCallId: pending.providerCallId, content: exec.content, isError: exec.isError });
    parts.push(...exec.parts);
    for (const p of exec.parts) if (p.type === "tool") emit({ type: "tool", part: p });
  }
  if (tainted !== run.tainted) await db.agentRun.update({ where: { id: run.id }, data: { tainted } });

  const next: RunState = {
    messages: [...state.messages, { role: "user", content: results.map((r) => ({ type: "tool_result" as const, toolCallId: r.toolCallId, content: r.content, isError: r.isError })) }],
    pendingResults: [],
    pendingCalls: [],
    parts,
    iterations: state.iterations,
  };
  return continueRun(run.id, next, emit);
}

// ───────────────────────────── Agent-Loop ─────────────────────────────

async function continueRun(runId: string, state: RunState, emit: EventSink, signal?: AbortSignal) {
  const run = await db.agentRun.findUniqueOrThrow({ where: { id: runId }, include: { user: true } });
  const ctx: ToolContext = { userId: run.userId, runId, timezone: run.user.timezone, now: new Date() };
  const provider = getAIProvider();
  const capabilities = await getCapabilityStatus(run.userId);
  const tools = toolsForCapabilities(capabilities);
  const specs = toolSpecs(tools);
  let tainted = run.tainted;
  const usage = (run.usage as { inputTokens?: number; outputTokens?: number }) ?? {};
  let inputTokens = usage.inputTokens ?? 0;
  let outputTokens = usage.outputTokens ?? 0;
  const pendingInputs: Record<string, unknown> = {};

  try {
    while (state.iterations < MAX_ITERATIONS) {
      state.iterations++;
      const res = await provider.generate({ system: SYSTEM_PROMPT, messages: state.messages, tools: specs, signal });
      inputTokens += res.usage.inputTokens;
      outputTokens += res.usage.outputTokens;
      state.messages.push({ role: "assistant", content: res.content });

      if (res.stopReason === "refusal") {
        state.parts.push({ type: "warning", text: "Das Modell hat diese Anfrage abgelehnt." });
        return await finish(run.id, run.conversationId, state, "COMPLETED", emit, { inputTokens, outputTokens }, textOf(res.content) || "Diese Anfrage kann ich so nicht bearbeiten.");
      }
      if (res.stopReason === "pause") continue;

      const calls = toolCallsOf(res.content);
      if (!calls.length) {
        const note = res.stopReason === "max_tokens" ? "\n\n_(Antwort wurde wegen Längenbegrenzung abgeschnitten.)_" : "";
        return await finish(run.id, run.conversationId, state, "COMPLETED", emit, { inputTokens, outputTokens }, textOf(res.content) + note);
      }
      if (res.stopReason === "max_tokens") {
        // Tool-Eingaben könnten abgeschnitten sein → nicht ausführen
        state.messages.push({ role: "user", content: calls.map((c) => ({ type: "tool_result" as const, toolCallId: c.id, content: "Eingabe abgeschnitten (Längenlimit). Bitte kürzer erneut aufrufen.", isError: true })) });
        continue;
      }

      const results: RunState["pendingResults"] = [];
      const pendingCalls: PendingCall[] = [];
      for (const call of calls) {
        const name = fromWireName(call.name);
        const tool = getTool(name);
        if (!tool || !tools.includes(tool)) {
          results.push({ toolCallId: call.id, content: `Unbekanntes oder nicht verfügbares Tool: ${name}`, isError: true });
          continue;
        }
        const parsed = tool.inputSchema.safeParse(call.input);
        if (!parsed.success) {
          results.push({ toolCallId: call.id, content: `Ungültige Eingabe: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`, isError: true });
          continue;
        }
        const input = parsed.data;
        const decision = await decide(run.userId, tool, input, tainted);

        if (decision.decision === "DENY") {
          const tc = await recordToolCall(run.id, run.userId, call.id, tool, input, decision.decision, "DENIED", { error: decision.reason });
          const part = toolPart(tc.id, tool.name, tool.title, "denied", decision.reason);
          state.parts.push(part);
          emit({ type: "tool", part });
          results.push({ toolCallId: call.id, content: `Nicht erlaubt: ${decision.reason} Der Benutzer kann das unter Einstellungen → Berechtigungen ändern.`, isError: true });
          continue;
        }
        if (decision.decision === "CONFIRM") {
          const tc = await recordToolCall(run.id, run.userId, call.id, tool, input, "CONFIRM", "AWAITING_CONFIRMATION");
          pendingInputs[tc.id] = call.input;
          pendingCalls.push({ providerCallId: call.id, toolCallId: tc.id });
          const part: Extract<MessagePart, { type: "confirmation" }> = {
            type: "confirmation",
            toolCallId: tc.id,
            title: tool.title,
            description: tool.describe?.(input) ?? tool.title,
            permission: tool.permission,
            reason: decision.reason,
          };
          state.parts.push(part, toolPart(tc.id, tool.name, tool.title, "awaiting_confirmation", "Wartet auf Bestätigung"));
          emit({ type: "confirmation", part });
          continue;
        }
        const exec = await executeTool(tool, input, ctx, undefined, { runId: run.id, userId: run.userId, providerCallId: call.id, decision: "ALLOW" });
        if (exec.untrusted && !tainted) {
          tainted = true;
          await db.agentRun.update({ where: { id: run.id }, data: { tainted: true } });
        }
        results.push({ toolCallId: call.id, content: exec.content, isError: exec.isError });
        state.parts.push(...exec.parts);
        for (const p of exec.parts) if (p.type === "tool") emit({ type: "tool", part: p });
        if (tool.name === PLAN_TOOL_NAME) emit({ type: "steps", steps: (input as { steps: { title: string; status: string }[] }).steps });
      }

      if (pendingCalls.length) {
        const saved = { ...state, pendingResults: results, pendingCalls, pendingInputs };
        await db.agentRun.update({
          where: { id: run.id },
          data: { status: "AWAITING_CONFIRMATION", state: saved as unknown as Prisma.InputJsonValue, usage: { inputTokens, outputTokens } },
        });
        const text = textOf(res.content) || "Ich habe Aktionen vorbereitet, die deine Bestätigung brauchen.";
        return await saveAssistantMessage(run.id, run.conversationId, text, state.parts, "AWAITING_CONFIRMATION", emit);
      }

      state.messages.push({ role: "user", content: results.map((r) => ({ type: "tool_result" as const, toolCallId: r.toolCallId, content: r.content, isError: r.isError })) });
    }
    state.parts.push({ type: "warning", text: `Abgebrochen nach ${MAX_ITERATIONS} Schritten.` });
    return await finish(run.id, run.conversationId, state, "COMPLETED", emit, { inputTokens, outputTokens }, "Ich habe die maximale Anzahl an Arbeitsschritten erreicht. Bisherige Ergebnisse siehe oben – sag mir, ob ich weitermachen soll.");
  } catch (err) {
    const info = toErrorInfo(err, "Agent");
    logger.error("agent.run.failed", { runId, reason: info.reason });
    await db.agentRun.update({ where: { id: run.id }, data: { status: "FAILED", error: formatError(info), finishedAt: new Date(), usage: { inputTokens, outputTokens } } });
    emit({ type: "error", error: info });
    state.parts.push({ type: "error", error: info });
    await closeBrowserSession(run.id);
    return saveAssistantMessage(run.id, run.conversationId, formatError(info), state.parts, "FAILED", emit);
  }
}

async function finish(runId: string, conversationId: string | null, state: RunState, status: "COMPLETED", emit: EventSink, usage: { inputTokens: number; outputTokens: number }, text: string) {
  await db.agentRun.update({
    where: { id: runId },
    data: { status, finishedAt: new Date(), usage, state: { messages: [], parts: [], pendingResults: [], pendingCalls: [], iterations: state.iterations } as unknown as Prisma.InputJsonValue },
  });
  // Offene Plan-Schritte als erledigt/übersprungen abschließen
  await db.agentStep.updateMany({ where: { runId, status: { in: ["RUNNING", "PENDING"] } }, data: { status: "SKIPPED", finishedAt: new Date() } });
  await closeBrowserSession(runId);
  const result = await saveAssistantMessage(runId, conversationId, text, state.parts, status, emit);
  const run = await db.agentRun.findUniqueOrThrow({ where: { id: runId } });
  if (run.trigger === "chat") await enqueue("memory.extract", { runId }, { userId: run.userId, dedupeKey: `memory.extract:${runId}` });
  return result;
}

async function saveAssistantMessage(runId: string, conversationId: string | null, text: string, parts: MessagePart[], status: string, emit: EventSink) {
  const merged = mergeParts(parts);
  let messageId = "";
  if (conversationId) {
    const msg = await db.message.create({ data: { conversationId, role: "ASSISTANT", content: text, parts: merged as unknown as Prisma.InputJsonValue, agentRunId: runId } });
    await db.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
    messageId = msg.id;
  }
  emit({ type: "message", messageId, content: text, parts: merged, status });
  return { runId, conversationId, messageId, content: text, parts: merged, status };
}

/** Quellen zusammenführen/deduplizieren; Reihenfolge der übrigen Teile bleibt erhalten. */
function mergeParts(parts: MessagePart[]): MessagePart[] {
  const sources: SourceRef[] = [];
  const seen = new Set<string>();
  const out: MessagePart[] = [];
  for (const p of parts) {
    if (p.type === "sources") {
      for (const s of p.sources) {
        const key = `${s.kind}:${s.id}:${s.location ?? ""}`;
        if (seen.has(key)) continue;
        seen.add(key);
        sources.push(s);
      }
    } else out.push(p);
  }
  if (sources.length) out.push({ type: "sources", sources: sources.slice(0, 30) });
  return out;
}

// ───────────────────────────── Tool-Ausführung ─────────────────────────────

async function decide(userId: string, tool: AnyTool, input: unknown, tainted: boolean) {
  const [override, user] = await Promise.all([
    db.permissionSetting.findUnique({ where: { userId_toolName: { userId, toolName: tool.name } } }),
    db.user.findUniqueOrThrow({ where: { id: userId }, select: { settings: true } }),
  ]);
  const scope = resolveScope(tool, input);
  let mode = ((user.settings as { defaultAutonomy?: string })?.defaultAutonomy ?? "ASSISTED") as "SAFE" | "ASSISTED" | "AUTONOMOUS";
  const capability = tool.capability ? getCapability(tool.capability) : undefined;
  if (capability && scope === "external") {
    const integration = await db.integration.findUnique({ where: { userId_provider: { userId, provider: capability.provider } } });
    if (integration) mode = integration.autonomyMode;
  }
  return decidePermission({ category: tool.permission, scope, mode, override: override?.decision, tainted });
}

async function recordToolCall(
  runId: string,
  userId: string,
  providerCallId: string,
  tool: AnyTool,
  input: unknown,
  decision: PermissionDecision,
  status: "AWAITING_CONFIRMATION" | "DENIED" | "RUNNING",
  extra: { error?: string } = {},
) {
  return db.toolCall.create({
    data: {
      runId,
      userId,
      providerCallId,
      toolName: tool.name,
      permission: tool.permission,
      decision,
      status,
      input: (redact(input) ?? {}) as Prisma.InputJsonValue,
      error: extra.error,
    },
  });
}

function toolPart(toolCallId: string, name: string, title: string, status: Extract<MessagePart, { type: "tool" }>["status"], summary?: string, extra: Partial<Extract<MessagePart, { type: "tool" }>> = {}) {
  return { type: "tool" as const, toolCallId, name, title, status, summary, ...extra };
}

async function executeTool(
  tool: AnyTool,
  input: unknown,
  ctx: ToolContext,
  existingToolCallId?: string,
  create?: { runId: string; userId: string; providerCallId: string; decision: PermissionDecision },
): Promise<{ content: string; isError: boolean; untrusted: boolean; parts: MessagePart[] }> {
  const started = Date.now();
  const toolCallId = existingToolCallId ?? (await recordToolCall(create!.runId, create!.userId, create!.providerCallId, tool, input, create!.decision, "RUNNING")).id;
  try {
    const result = await tool.execute(input, ctx);
    const durationMs = Date.now() - started;
    await db.toolCall.update({
      where: { id: toolCallId },
      data: { status: "SUCCEEDED", durationMs, output: (redact({ summary: result.summary, verified: result.verified, data: result.data }) ?? {}) as Prisma.InputJsonValue },
    });
    const payload = JSON.stringify({ summary: result.summary, verified: result.verified, data: result.data });
    const clipped = payload.length > MAX_TOOL_RESULT_CHARS ? `${payload.slice(0, MAX_TOOL_RESULT_CHARS)}… [gekürzt]` : payload;
    if (result.untrusted && detectInjection(payload))
      await audit({ userId: ctx.userId, actor: "SYSTEM", action: "security.injection_suspected", target: tool.name, metadata: { runId: ctx.runId } });
    const parts: MessagePart[] = [];
    if (tool.name !== PLAN_TOOL_NAME)
      parts.push(toolPart(toolCallId, tool.name, tool.title, "succeeded", result.summary, { verified: result.verified }));
    if (result.sources?.length) parts.push({ type: "sources", sources: result.sources });
    if (result.visualization) parts.push({ type: "visualization", spec: result.visualization });
    return { content: wrapToolResult(tool.name, clipped, Boolean(result.untrusted)), isError: false, untrusted: Boolean(result.untrusted), parts };
  } catch (err) {
    const info = toErrorInfo(err, tool.title);
    await db.toolCall.update({ where: { id: toolCallId }, data: { status: "FAILED", durationMs: Date.now() - started, error: formatError(info) } });
    return {
      content: JSON.stringify({ error: info }),
      isError: true,
      untrusted: false,
      parts: [toolPart(toolCallId, tool.name, tool.title, "failed", info.reason, { error: info })],
    };
  }
}

// ───────────────────────────── Verlauf ─────────────────────────────

async function loadHistory(conversationId: string): Promise<AIMessage[]> {
  const rows = await db.message.findMany({ where: { conversationId }, orderBy: { createdAt: "desc" }, take: HISTORY_MESSAGES });
  const msgs: AIMessage[] = [];
  for (const m of rows.reverse()) {
    if (m.role === "SYSTEM") continue;
    const parts = (m.parts as unknown as MessagePart[]) ?? [];
    let text = m.content;
    if (m.role === "ASSISTANT") {
      const actions = parts.filter((p): p is Extract<MessagePart, { type: "tool" }> => p.type === "tool").map((p) => `${p.title}: ${p.status}${p.summary ? ` (${p.summary})` : ""}`);
      if (actions.length) text += `\n\n[Ausgeführte Aktionen: ${actions.join("; ")}]`;
    }
    const role = m.role === "USER" ? "user" : "assistant";
    const last = msgs[msgs.length - 1];
    if (last && last.role === role) last.content.push({ type: "text", text });
    else msgs.push({ role, content: [{ type: "text", text }] });
  }
  // Muss mit einer Benutzernachricht beginnen
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  return msgs;
}

function titleFrom(message: string) {
  const t = message.replace(/\s+/g, " ").trim();
  return t.length > 60 ? `${t.slice(0, 57)}…` : t || "Neue Unterhaltung";
}
