import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/security/crypto";
import { schedulerTick } from "@/lib/jobs/scheduler";

/** Scheduler-Tick für serverlose Umgebungen (z. B. Vercel Cron). Jobs selbst verarbeitet der Worker. */
export async function POST(req: NextRequest) {
  const secret = env().CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await schedulerTick());
}
