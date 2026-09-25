import { db } from "@/lib/database/prisma";
import { upsertExam } from "@/lib/exams/service";
import { decryptJson, encryptJson } from "@/lib/security/crypto";
import { AppError, formatError, toErrorInfo } from "@/lib/errors";
import { audit } from "@/lib/observability/audit";
import { assertPublicUrl } from "@/lib/security/ssrf";
import { IcsSchoolAdapter } from "./provider";

interface SchoolConfig {
  icsUrl: string;
  platformName?: string;
}

export async function connectSchoolIcs(userId: string, icsUrl: string, platformName?: string) {
  await assertPublicUrl(icsUrl, "Schulplattform verbinden");
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  // Testabruf, damit keine defekte Verbindung als „verbunden“ erscheint
  const data = await new IcsSchoolAdapter(icsUrl, user.timezone).fetch();
  await db.integration.upsert({
    where: { userId_provider: { userId, provider: "SCHOOL_ICS" } },
    create: { userId, provider: "SCHOOL_ICS", status: "CONNECTED", configEnc: encryptJson({ icsUrl, platformName } satisfies SchoolConfig), externalAccountEmail: platformName ?? null },
    update: { status: "CONNECTED", configEnc: encryptJson({ icsUrl, platformName } satisfies SchoolConfig), externalAccountEmail: platformName ?? null, lastError: null },
  });
  await audit({ userId, actor: "USER", action: "integration.connected", target: "SCHOOL_ICS", metadata: { platformName } });
  return { exams: data.exams.length, events: data.events.length };
}

export async function syncSchool(userId: string) {
  const integration = await db.integration.findUnique({ where: { userId_provider: { userId, provider: "SCHOOL_ICS" } } });
  if (!integration || integration.status === "DISCONNECTED" || !integration.configEnc)
    throw new AppError({ code: "INTEGRATION_NOT_CONNECTED", action: "Schulplattform synchronisieren", reason: "Keine Schulplattform verbunden.", solution: "ICS-Link unter Einstellungen → Integrationen hinterlegen." });
  const config = decryptJson<SchoolConfig>(integration.configEnc);
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  try {
    const data = await new IcsSchoolAdapter(config.icsUrl, user.timezone).fetch();
    let newExams = 0;
    let changedExams = 0;
    for (const e of data.exams) {
      const r = await upsertExam(userId, { subject: e.subject, title: e.title, start: e.start, end: e.end, location: e.location, topics: e.topics, source: "SCHOOL", externalId: e.externalId });
      if (r.created) newExams++;
      if (r.changed) changedExams++;
    }
    const seen = new Set<string>();
    for (const e of data.events) {
      seen.add(e.externalId);
      await db.calendarEvent.upsert({
        where: { userId_source_externalId: { userId, source: "SCHOOL", externalId: e.externalId } },
        create: { userId, source: "SCHOOL", externalId: e.externalId, title: e.title, start: e.start, end: e.end, allDay: e.allDay, location: e.location ?? null, description: e.description ?? null },
        update: { title: e.title, start: e.start, end: e.end, allDay: e.allDay, location: e.location ?? null, description: e.description ?? null, status: "CONFIRMED" },
      });
    }
    // Zukünftige Einträge, die im Export fehlen → als abgesagt markieren
    await db.calendarEvent.updateMany({
      where: { userId, source: "SCHOOL", start: { gte: new Date() }, externalId: { notIn: [...seen] } },
      data: { status: "CANCELLED" },
    });
    await db.integration.update({ where: { id: integration.id }, data: { lastSyncAt: new Date(), lastError: null, status: "CONNECTED" } });
    return { newExams, changedExams, events: data.events.length, warnings: data.warnings };
  } catch (err) {
    await db.integration.update({ where: { id: integration.id }, data: { lastError: formatError(toErrorInfo(err, "Schulplattform synchronisieren")), status: "ERROR" } });
    throw err;
  }
}
