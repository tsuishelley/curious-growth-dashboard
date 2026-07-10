import { notFound } from "next/navigation";
import { getCompanyBySlug } from "@/lib/config/portfolio";
import { getCompanyMetrics } from "@/lib/metrics";
import { getLatestInsight } from "@/lib/insights";
import CompanyMetricsView from "@/components/CompanyMetricsView";
import WeeklyInsights from "@/components/WeeklyInsights";

export const dynamic = "force-dynamic";

// Fetch enough history to cover every range the dashboard's selector supports:
// 90 days current + 90 days prior for the "Last 90 Days" comparison, and up to
// ~366 days for "YTD" (which has no prior-period comparison). 400 comfortably
// covers both; missing days simply aren't in Firestore yet and are skipped.
const FETCH_DAYS = 400;

export default async function CompanyDashboardPage({ params }: { params: { company: string } }) {
  const company = getCompanyBySlug(params.company);
  if (!company) notFound();

  const [metrics, insight] = await Promise.all([
    getCompanyMetrics(company.id, FETCH_DAYS),
    getLatestInsight(company.id),
  ]);

  return (
    <div className="space-y-6">
      {insight && <WeeklyInsights insight={insight} />}
      <CompanyMetricsView company={company} metrics={metrics} />
    </div>
  );
}
