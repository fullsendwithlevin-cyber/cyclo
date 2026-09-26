import { api, parseBody } from "@/lib/http/api";
import { examInputSchema, listUpcomingExams, upsertExam } from "@/lib/exams/service";

export const GET = api(async ({ user }) => ({ exams: await listUpcomingExams(user.id, new Date(), 50) }));
export const POST = api(async ({ req, user }) => {
  const input = await parseBody(req, examInputSchema.omit({ source: true, externalId: true }));
  return upsertExam(user.id, { ...input, source: "MANUAL" });
});
