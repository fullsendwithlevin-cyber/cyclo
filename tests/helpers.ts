import { db } from "@/lib/database/prisma";

/** Leert alle Tabellen (außer Migrationen) – Integrationstests starten mit leerer DB. */
export async function resetDb() {
  const tables = await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length) await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);
}

export async function createUser(overrides: { email?: string; timezone?: string; settings?: object } = {}) {
  return db.user.create({
    data: { email: overrides.email ?? `user${Date.now()}${Math.random()}@test.local`, name: "Test", timezone: overrides.timezone ?? "Europe/Zurich", settings: overrides.settings ?? {} },
  });
}
