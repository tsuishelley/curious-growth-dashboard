import { NextRequest, NextResponse } from "next/server";
import { portfolioCompanies } from "@/lib/config/portfolio";
import { getCompanyMetrics } from "@/lib/metrics";
import { generateAndStoreWeeklyInsight } from "@/lib/insights";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured — weekly insights are disabled." },
      { status: 400 }
    );
  }

  // ?force=1 regenerates even if this week's insight already exists.
  const force = new URL(request.url).searchParams.get("force") === "1";

  const results: { companyId: string; generated: boolean }[] = [];
  for (const company of portfolioCompanies) {
    try {
      // 14 days = this week + prior week, for the week-over-week comparison.
      const metrics = await getCompanyMetrics(company.id, 14);
      const insight = await generateAndStoreWeeklyInsight(company, metrics, force);
      results.push({ companyId: company.id, generated: insight !== null });
    } catch (err) {
      results.push({ companyId: company.id, generated: false });
      console.error(`Insight generation failed for ${company.id}:`, err);
    }
  }

  return NextResponse.json({ ok: true, generatedAt: new Date().toISOString(), results });
}
