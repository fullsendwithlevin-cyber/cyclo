import { z } from "zod";
import { db } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors";

export const noteInputSchema = z.object({
  title: z.string().trim().min(1).max(300),
  content: z.string().max(100_000),
  projectId: z.string().nullish(),
});

export async function createNote(userId: string, raw: z.infer<typeof noteInputSchema>) {
  const input = noteInputSchema.parse(raw);
  if (input.projectId && !(await db.project.findFirst({ where: { id: input.projectId, userId } })))
    throw new AppError({ code: "NOT_FOUND", action: "Notiz speichern", reason: "Projekt nicht gefunden." });
  return db.note.create({ data: { userId, title: input.title, content: input.content, projectId: input.projectId ?? null } });
}

export const listNotes = (userId: string, projectId?: string) =>
  db.note.findMany({ where: { userId, projectId }, orderBy: { updatedAt: "desc" }, take: 200 });

export async function deleteNote(userId: string, id: string) {
  const n = await db.note.deleteMany({ where: { id, userId } });
  if (!n.count) throw new AppError({ code: "NOT_FOUND", action: "Notiz löschen", reason: "Notiz nicht gefunden." });
}
