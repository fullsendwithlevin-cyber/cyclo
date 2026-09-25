import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/database/prisma";
import { readStoredFile } from "@/lib/documents/storage";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: { code: "UNAUTHENTICATED", action: "Download", reason: "Nicht angemeldet." } }, { status: 401 });
  const { id } = await params;
  const doc = await db.document.findFirst({ where: { id, userId: user.id } });
  if (!doc?.storagePath) return NextResponse.json({ error: { code: "NOT_FOUND", action: "Download", reason: "Datei nicht gefunden." } }, { status: 404 });
  const data = await readStoredFile(doc.storagePath);
  return new NextResponse(new Uint8Array(data), {
    headers: {
      // Immer als Download ausliefern – verhindert XSS über hochgeladene HTML/SVG-Inhalte
      "content-type": "application/octet-stream",
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(doc.filename)}`,
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store",
    },
  });
}
