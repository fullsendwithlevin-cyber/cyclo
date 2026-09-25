import { z } from "zod";
import { db } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors";
import { DataSource } from "@/lib/generated/prisma/enums";
import { emitDomainEvent } from "@/lib/automation/events";

export const examInputSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(300),
  start: z.coerce.date(),
  end: z.coerce.date().nullish(),
  location: z.string().max(300).nullish(),
  topics: z.array(z.string().max(300)).max(100).optional(),
  notes: z.string().max(5000).nullish(),
  projectId: z.string().nullish(),
  source: z.enum(DataSource).optional(),
  externalId: z.string().max(500).nullish(),
});
export type ExamInput = z.infer<typeof examInputSchema>;

const EXAM_PATTERN = /(?<!\p{L})(prüfung|pruefung|klausur|schularbeit|test|exam|lernkontrolle|lk|abschlussprüfung|matura|quiz|kolloquium)(?!\p{L})/iu;

/** Heuristik für Einträge aus Schulplattformen / Kalendern. */
export const looksLikeExam = (text: string) => EXAM_PATTERN.test(text);

export async function listUpcomingExams(userId: string, from = new Date(), limit = 20) {
  return db.exam.findMany({
    where: { userId, start: { gte: new Date(from.getTime() - 864e5) } },
    orderBy: { start: "asc" },
    take: limit,
    include: { events: { where: { kind: "STUDY_BLOCK" }, orderBy: { start: "asc" } }, tasks: true },
  });
}

export async function getExam(userId: string, id: string) {
  const exam = await db.exam.findFirst({
    where: { id, userId },
    include: { events: { orderBy: { start: "asc" } }, tasks: true, project: true },
  });
  if (!exam) throw new AppError({ code: "NOT_FOUND", action: "Prüfung laden", reason: "Prüfung nicht gefunden." });
  return exam;
}

/**
 * Legt eine Prüfung an oder aktualisiert sie (Deduplizierung über Quelle + externe ID).
 * Löst Domain-Events „exam.detected“ bzw. „exam.changed“ aus.
 */
export async function upsertExam(userId: string, raw: ExamInput) {
  const input = examInputSchema.parse(raw);
  const source = input.source ?? "MANUAL";
  const data = {
    subject: input.subject,
    title: input.title,
    start: input.start,
    end: input.end ?? null,
    location: input.location ?? null,
    topics: input.topics ?? [],
    notes: input.notes ?? null,
    projectId: input.projectId ?? null,
  };
  if (input.externalId) {
    const existing = await db.exam.findUnique({
      where: { userId_source_externalId: { userId, source, externalId: input.externalId } },
    });
    if (existing) {
      const changed = existing.start.getTime() !== input.start.getTime();
      const exam = await db.exam.update({ where: { id: existing.id }, data: { ...data, topics: input.topics ?? existing.topics } });
      if (changed)
        await emitDomainEvent(userId, "exam.changed", { examId: exam.id, previousStart: existing.start.toISOString(), start: exam.start.toISOString(), subject: exam.subject }, `exam.changed:${exam.id}:${exam.start.toISOString()}`);
      return { exam, created: false, changed };
    }
  }
  const exam = await db.exam.create({ data: { userId, source, externalId: input.externalId ?? null, ...data } });
  await emitDomainEvent(userId, "exam.detected", { examId: exam.id, subject: exam.subject, title: exam.title, start: exam.start.toISOString(), source }, `exam.detected:${exam.id}`);
  return { exam, created: true, changed: false };
}

export async function updateExam(userId: string, id: string, raw: Partial<ExamInput>) {
  const patch = examInputSchema.partial().parse(raw);
  const existing = await getExam(userId, id);
  const exam = await db.exam.update({ where: { id }, data: { ...patch, source: undefined, externalId: undefined } });
  if (patch.start && patch.start.getTime() !== existing.start.getTime())
    await emitDomainEvent(userId, "exam.changed", { examId: id, previousStart: existing.start.toISOString(), start: patch.start.toISOString(), subject: exam.subject }, `exam.changed:${id}:${patch.start.toISOString()}`);
  return exam;
}

export async function deleteExam(userId: string, id: string) {
  await getExam(userId, id);
  await db.exam.delete({ where: { id } });
}
