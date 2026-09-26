import { z } from "zod";
import { db } from "@/lib/database/prisma";
import { defineTool } from "./types";

export const PLAN_TOOL_NAME = "plan.update";

/**
 * Der Agent legt bei mehrstufigen Aufgaben seinen Plan offen und aktualisiert den Status.
 * Wird im UI als Agent-Run-Ansicht (✓ erledigt, ● läuft, ○ offen) angezeigt.
 */
export const planTool = defineTool({
  name: PLAN_TOOL_NAME,
  title: "Plan aktualisieren",
  description:
    "Für Aufgaben mit mehreren Schritten: Lege zu Beginn den Plan fest (3–12 kurze Schritte auf Deutsch) und aktualisiere ihn, wenn Schritte erledigt sind. Übergib jeweils die vollständige Liste.",
  inputSchema: z.object({
    steps: z
      .array(z.object({ title: z.string().min(1).max(120), status: z.enum(["pending", "running", "done", "failed", "waiting", "skipped"]) }))
      .min(1)
      .max(15),
  }),
  permission: "READ",
  scope: "internal",
  async execute({ steps }, ctx) {
    const map = { pending: "PENDING", running: "RUNNING", done: "DONE", failed: "FAILED", waiting: "WAITING", skipped: "SKIPPED" } as const;
    const now = new Date();
    await db.$transaction([
      db.agentStep.deleteMany({ where: { runId: ctx.runId } }),
      db.agentStep.createMany({
        data: steps.map((s, index) => ({
          runId: ctx.runId,
          index,
          title: s.title,
          status: map[s.status],
          startedAt: s.status === "pending" ? null : now,
          finishedAt: ["done", "failed", "skipped"].includes(s.status) ? now : null,
        })),
      }),
    ]);
    return { data: { ok: true }, summary: `Plan: ${steps.filter((s) => s.status === "done").length}/${steps.length} erledigt` };
  },
});
