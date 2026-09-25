// Prisma kennt die pgvector-/Volltext-Indexe nicht und erzeugt in neuen Migrationen
// "DROP INDEX" dafür. Dieser Check verhindert, dass solche Zeilen eingecheckt werden.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const PROTECTED = ["DocumentChunk_embedding_hnsw", "DocumentChunk_searchVector_gin", "Memory_embedding_hnsw"];
const dir = "prisma/migrations";
let failed = false;
for (const name of readdirSync(dir, { withFileTypes: true })) {
  if (!name.isDirectory()) continue;
  const sql = readFileSync(join(dir, name.name, "migration.sql"), "utf8");
  for (const idx of PROTECTED) {
    if (new RegExp(`DROP INDEX\\s+"${idx}"`).test(sql)) {
      console.error(`${name.name}: entfernt geschützten Index ${idx} – Zeile aus der Migration löschen.`);
      failed = true;
    }
  }
}
process.exit(failed ? 1 : 0);
