import { notFound } from "next/navigation";
import { getCompanyBySlug } from "@/lib/config/portfolio";
import { generateSampleSeries } from "@/lib/sampleData";
import CompanyMetricsView from "@/components/CompanyMetricsView";

// Fetch enough history to cover every range the dashboard's selector supports:
// 90 days current + 90 days prior for the "Last 90 Days" comparison, and up to
// ~366 days for "YTD" (which has no prior-period comparison).
const FETCH_DAYS = 400;

export default function DemoCompanyPage({ params }: { params: { company: string } }) {
  const company = getCompanyBySlug(params.company);
  if (!company) notFound();

  const metrics = generateSampleSeries(company, FETCH_DAYS);

  return <CompanyMetricsView company={company} metrics={metrics} />;
}
