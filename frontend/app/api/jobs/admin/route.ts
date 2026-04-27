/**
 * GET /api/jobs/admin?id=<jobId>   – inspect a specific job
 * GET /api/jobs/admin              – queue depth + DLQ list
 *
 * Protected by ADMIN_SECRET.
 */
import { NextRequest, NextResponse } from "next/server";
import { getJob, queueStats, listDlq } from "@/lib/jobs/queue";

const ADMIN_SECRET = process.env.ADMIN_SECRET;

function authorized(req: NextRequest): boolean {
  if (!ADMIN_SECRET) return true; // open in local dev
  return req.headers.get("authorization") === `Bearer ${ADMIN_SECRET}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get("id");

  if (id) {
    const job = await getJob(id);
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    return NextResponse.json(job);
  }

  const [stats, dlq] = await Promise.all([queueStats(), listDlq(20)]);
  return NextResponse.json({ ...stats, dlqJobs: dlq });
}
