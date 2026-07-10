import { NextRequest, NextResponse } from "next/server";
import { syncAllCompanies } from "@/lib/sync";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const results = await syncAllCompanies(1);
    return NextResponse.json({
      ok: true,
      syncedAt: new Date().toISOString(),
      companies: results.map((r) => ({
        companyId: r.companyId,
        date: r.date,
        sourceStatus: r.sourceStatus,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 }
    );
  }
}
