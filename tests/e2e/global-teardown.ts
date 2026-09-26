import { readFileSync, rmSync } from "node:fs";

export default async function globalTeardown() {
  try {
    const pid = Number(readFileSync("storage/.e2e-worker.pid", "utf8"));
    process.kill(-pid, "SIGTERM");
  } catch {}
  rmSync("storage/.e2e-worker.pid", { force: true });
}
