import { db } from "@/lib/database/prisma";
import { api } from "@/lib/http/api";
import { automationByKey, ensureDefaultAutomations } from "@/lib/automation/defaults";

export const GET = api(async ({ user }) => {
  await ensureDefaultAutomations(user.id);
  const rows = await db.automation.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
  return {
    automations: rows.map((a) => {
      const def = automationByKey((a.config as { key?: string })?.key ?? "");
      return { id: a.id, name: a.name, trigger: a.trigger, enabled: a.enabled, lastRunAt: a.lastRunAt, description: def?.description ?? "" };
    }),
  };
});
