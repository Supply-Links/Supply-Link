/**
 * POST /api/jobs/process
 * Triggered by a cron job (e.g. Vercel Cron) or internal call.
 * Processes up to `batch` jobs per invocation (default 10).
 *
 * Protected by CRON_SECRET to prevent public abuse.
 */
import { NextRequest, NextResponse } from "next/server";
import { processNextJob } from "@/lib/jobs/worker";
import "@/lib/jobs/handlers"; // register all handlers

const CRON_SECRET = process.env.CRON_SECRET;

export async function POST(req: NextRequest) {
  if (CRON_SECRET) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const { searchParams } = req.nextUrl;
  const batch = Math.min(parseInt(searchParams.get("batch") ?? "10", 10), 50);

  const processed: string[] = [];
  for (let i = 0; i < batch; i++) {
    const id = await processNextJob();
    if (!id) break;
    processed.push(id);
  }

  return NextResponse.json({ processed: processed.length, jobIds: processed });
}
