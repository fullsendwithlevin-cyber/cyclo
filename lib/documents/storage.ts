import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";

/** Lokaler Dateispeicher (austauschbar gegen S3 o. Ä. mit gleichem Interface). */
function root() {
  return path.resolve(/* turbopackIgnore: true */ process.cwd(), env().UPLOAD_DIR);
}

function safePath(userId: string, key: string) {
  if (!/^[a-z0-9]+$/i.test(userId) || !/^[a-f0-9]{64}$/.test(key)) throw new Error("Ungültiger Speicherschlüssel");
  return path.join(root(), userId, key);
}

export async function storeFile(userId: string, sha256: string, data: Buffer): Promise<string> {
  const p = safePath(userId, sha256);
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, data, { mode: 0o600 });
  return `${userId}/${sha256}`;
}

export async function readStoredFile(storagePath: string): Promise<Buffer> {
  const [userId, key] = storagePath.split("/");
  return readFile(safePath(userId ?? "", key ?? ""));
}

export async function deleteStoredFile(storagePath: string) {
  const [userId, key] = storagePath.split("/");
  await rm(safePath(userId ?? "", key ?? ""), { force: true });
}
