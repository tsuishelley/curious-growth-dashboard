import { BetaAnalyticsDataClient } from "@google-analytics/data";
import { GA4_SERVICE_ACCOUNT_ENV, type PortfolioCompany } from "@/lib/config/portfolio";
import type { SourceStatus, TrafficMetrics } from "@/lib/types";

let cachedClient: BetaAnalyticsDataClient | null = null;

function getClient(): BetaAnalyticsDataClient | null {
  const credsJson = process.env[GA4_SERVICE_ACCOUNT_ENV];
  if (!credsJson) return null;
  if (cachedClient) return cachedClient;
  cachedClient = new BetaAnalyticsDataClient({ credentials: JSON.parse(credsJson) });
  return cachedClient;
}

export interface Ga4Result {
  status: SourceStatus;
  traffic: TrafficMetrics | null;
  /** Sessions count, used as the "visitor" stage of the funnel. */
  visitorCount: number | null;
}

/** Pulls GA4 traffic metrics for the trailing `dateRangeDays` days via the shared service account. */
export async function fetchGa4Metrics(company: PortfolioCompany, dateRangeDays = 1): Promise<Ga4Result> {
  const config = company.sources.ga4;
  if (!config) {
    return { status: { source: "ga4", connected: false }, traffic: null, visitorCount: null };
  }

  const propertyId = process.env[config.propertyIdEnv];
  const client = getClient();

  if (!propertyId || !client) {
    return {
      status: {
        source: "ga4",
        connected: false,
        error: `Missing ${GA4_SERVICE_ACCOUNT_ENV} or ${config.propertyIdEnv}`,
      },
      traffic: null,
      visitorCount: null,
    };
  }

  try {
    const [summary] = await client.runReport({
      property: propertyId,
      dateRanges: [{ startDate: `${dateRangeDays}daysAgo`, endDate: "today" }],
      metrics: [{ name: "sessions" }, { name: "newUsers" }, { name: "activeUsers" }],
    });

    const row = summary.rows?.[0];
    const sessions = Number(row?.metricValues?.[0]?.value ?? 0);
    const newUsers = Number(row?.metricValues?.[1]?.value ?? 0);
    const activeUsers = Number(row?.metricValues?.[2]?.value ?? 0);

    const [channelReport, pagesReport] = await Promise.all([
      client.runReport({
        property: propertyId,
        dateRanges: [{ startDate: `${dateRangeDays}daysAgo`, endDate: "today" }],
        dimensions: [{ name: "sessionDefaultChannelGroup" }],
        metrics: [{ name: "sessions" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 8,
      }),
      client.runReport({
        property: propertyId,
        dateRanges: [{ startDate: `${dateRangeDays}daysAgo`, endDate: "today" }],
        dimensions: [{ name: "unifiedScreenName" }],
        metrics: [{ name: "screenPageViews" }],
        orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
        limit: 8,
      }),
    ]);

    const topChannels = (channelReport[0].rows ?? []).map((r) => ({
      channel: r.dimensionValues?.[0]?.value ?? "Unknown",
      sessions: Number(r.metricValues?.[0]?.value ?? 0),
    }));

    const topPages = (pagesReport[0].rows ?? []).map((r) => ({
      title: r.dimensionValues?.[0]?.value ?? "Unknown",
      views: Number(r.metricValues?.[0]?.value ?? 0),
    }));

    return {
      status: { source: "ga4", connected: true },
      traffic: { sessions, newUsers, activeUsers, topChannels, topPages },
      visitorCount: sessions,
    };
  } catch (err) {
    return {
      status: { source: "ga4", connected: false, error: err instanceof Error ? err.message : "GA4 fetch failed" },
      traffic: null,
      visitorCount: null,
    };
  }
}
