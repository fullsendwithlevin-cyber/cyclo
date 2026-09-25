import { api, parseBody } from "@/lib/http/api";
import { deleteExam, examInputSchema, getExam, updateExam } from "@/lib/exams/service";

export const GET = api<{ id: string }>(async ({ user, params }) => ({ exam: await getExam(user.id, params.id) }));
export const PATCH = api<{ id: string }>(async ({ req, user, params }) => ({
  exam: await updateExam(user.id, params.id, await parseBody(req, examInputSchema.omit({ source: true, externalId: true }).partial())),
}));
export const DELETE = api<{ id: string }>(async ({ user, params }) => {
  await deleteExam(user.id, params.id);
  return { ok: true };
});
