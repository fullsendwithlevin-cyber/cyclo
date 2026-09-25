import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { e2eEnv } from "../../playwright.config";

/** Startet den Worker (verarbeitet Dokumente/Events wie in Produktion). Die DB legt der Webserver-Befehl an. */
export default async function globalSetup() {
  mkdirSync("storage", { recursive: true });
  const worker = spawn("npx", ["tsx", "workers/index.ts"], { env: { ...process.env, ...e2eEnv }, stdio: "ignore", detached: true });
  writeFileSync("storage/.e2e-worker.pid", String(worker.pid));
  worker.unref();
}
