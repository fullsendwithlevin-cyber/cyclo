import { execSync } from "node:child_process";
import { config } from "dotenv";
import pg from "pg";

/**
 * Legt eine separate Test-Datenbank an (<db>_test) und spielt alle Migrationen ein.
 * Unit-Tests brauchen keine DB; ist Postgres nicht erreichbar, werden Integrationstests übersprungen.
 */
export default async function setup() {
  config({ quiet: true });
  const base = process.env.DATABASE_URL;
  if (!base) return;
  const url = new URL(base);
  const testDb = `${url.pathname.slice(1)}_test`;
  const admin = new pg.Client({ connectionString: base });
  try {
    await admin.connect();
  } catch {
    process.env.TEST_DB_UNAVAILABLE = "1";
    return;
  }
  const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [testDb]);
  if (!exists.rowCount) await admin.query(`CREATE DATABASE "${testDb}"`);
  await admin.end();
  url.pathname = `/${testDb}`;
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url.toString() }, stdio: "ignore" });
  process.env.TEST_DATABASE_URL = url.toString();
}
