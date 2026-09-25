import { z } from "zod";
import { db } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors";
import { api, parseBody } from "@/lib/http/api";

export const PATCH = api<{ id: string }>(async ({ req, user, params }) => {
  const { enabled } = await parseBody(req, z.object({ enabled: z.boolean() }));
  const res = await db.automation.updateMany({ where: { id: params.id, userId: user.id }, data: { enabled } });
  if (!res.count) throw new AppError({ code: "NOT_FOUND", action: "Automation", reason: "Nicht gefunden." });
  return { ok: true };
});
