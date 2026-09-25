import { z } from "zod";
import { db } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors";
import { api, parseBody } from "@/lib/http/api";
import { decidePermission } from "@/lib/permissions/policy";
import { ALL_TOOLS, getTool } from "@/lib/tools/registry";
import { getUserSettings } from "@/lib/users/settings";
import { audit } from "@/lib/observability/audit";

export const GET = api(async ({ user }) => {
  const [overrides, settings] = await Promise.all([db.permissionSetting.findMany({ where: { userId: user.id } }), getUserSettings(user.id)]);
  const map = new Map(overrides.map((o) => [o.toolName, o.decision]));
  return {
    defaultAutonomy: settings.defaultAutonomy,
    tools: ALL_TOOLS.filter((t) => t.name !== "plan.update").map((t) => {
      const scope = typeof t.scope === "function" ? "external" : t.scope;
      const preview = decidePermission({ category: t.permission, scope, mode: settings.defaultAutonomy, override: map.get(t.name) ?? null, tainted: false });
      return {
        name: t.name,
        title: t.title,
        description: t.description,
        permission: t.permission,
        scope: typeof t.scope === "function" ? "variabel" : t.scope,
        capability: t.capability ?? null,
        override: map.get(t.name) ?? null,
        effective: preview.decision,
        reason: preview.reason,
      };
    }),
  };
});

export const PUT = api(async ({ req, user }) => {
  const { toolName, decision } = await parseBody(req, z.object({ toolName: z.string(), decision: z.enum(["ALLOW", "CONFIRM", "DENY"]).nullable() }));
  if (!getTool(toolName)) throw new AppError({ code: "NOT_FOUND", action: "Berechtigung ändern", reason: "Unbekanntes Tool." });
  if (decision === null) await db.permissionSetting.deleteMany({ where: { userId: user.id, toolName } });
  else await db.permissionSetting.upsert({ where: { userId_toolName: { userId: user.id, toolName } }, create: { userId: user.id, toolName, decision }, update: { decision } });
  await audit({ userId: user.id, actor: "USER", action: "permission.changed", target: toolName, metadata: { decision } });
  return { ok: true };
});
