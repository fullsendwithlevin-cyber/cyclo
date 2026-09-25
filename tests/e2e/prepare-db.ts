import { execSync } from "node:child_process";
import pg from "pg";

/** Erzeugt eine frische E2E-Datenbank (läuft vor dem Start des Webservers). */
async function main() {
  const url = new URL(process.env.DATABASE_URL!);
  const name = url.pathname.slice(1);
  if (!name.endsWith("_e2e")) throw new Error("E2E-Datenbank muss auf _e2e enden (Schutz vor Datenverlust).");
  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${name}"`);
  await admin.end();
  execSync("npx prisma migrate deploy", { stdio: "ignore", env: process.env });
}

void main();
