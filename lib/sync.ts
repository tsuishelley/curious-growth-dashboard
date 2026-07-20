import { format } from "date-fns";
import { adminDb } from "@/lib/firebase/admin";
import { portfolioCompanies, type FunnelStage, type PortfolioCompany, type SourceType } from "@/lib/config/portfolio";
import { fetchGa4Metrics } from "@/lib/sources/ga4";
import { fetchHubspotMetrics, type HubspotResult } from "@/lib/sources/hubspot";
import { fetchPosthogMetrics, type PosthogResult } from "@/lib/sources/posthog";
import { fetchSearchConsoleMetrics, type SearchConsoleResult } from "@/lib/sources/searchconsole";
import { fetchGoogleAdsMetrics } from "@/lib/sources/googleads";
import { fetchAttributionFunnel } from "@/lib/sources/posthogFunnel";
import { fetchPosthogTraffic } from "@/lib/sources/posthogTraffic";
import type { DailyMetrics, FunnelStageValue, SourceStatus, TrafficMetrics } from "@/lib/types";

function resolveFunnelValue(
  stage: FunnelStage,
  data: { traffic: TrafficMetrics | null; hubspot: HubspotResult; posthog: PosthogResult }
): number {
  // Uses the unified `traffic` (GA4 if connected, else the PostHog fallback)
  // so the funnel's "Visitor" stage reflects real traffic either way, instead
  // of silently showing 0 whenever GA4 specifically isn't connected.
  if (stage.source === "ga4") return data.traffic?.sessions ?? 0;

  if (stage.source === "posthog") {
    if (!data.posthog.signups) return 0;
    return stage.key === "activated" ? data.posthog.signups.activatedUsers : data.posthog.signups.signups;
  }

  if (stage.source === "hubspot") {
    if (!data.hubspot.funnelCounts) return 0;
    if (stage.key === "mql") return data.hubspot.funnelCounts.mql;
    if (stage.key === "demo") return data.hubspot.funnelCounts.demo;
    if (stage.key === "customer") return data.hubspot.funnelCounts.customer;
    return data.hubspot.funnelCounts.lead;
  }

  return 0;
}

export async function syncCompany(company: PortfolioCompany, days = 1): Promise<DailyMetrics | null> {
  const [ga4, hubspot, posthog, searchConsole, googleAds, attributionFunnel, posthogTraffic] = await Promise.all([
    fetchGa4Metrics(company, days),
    fetchHubspotMetrics(company, days),
    fetchPosthogMetrics(company, days),
    fetchSearchConsoleMetrics(company, days),
    fetchGoogleAdsMetrics(company, days),
    // Always queried over a 30-day window regardless of `days`, matching the
    // dashboard's fixed 30-day trend convention -- this is a point-in-time
    // snapshot re-run, not a daily-delta metric like the others.
    fetchAttributionFunnel(company, 30),
    fetchPosthogTraffic(company, days),
  ]);

  // If no source is actually connected, don't write an empty shell doc — that
  // would clutter a company that has no real credentials yet with a dead row
  // and prevent its dashboard tab from showing the clean "No data yet" state.
  const anyConnected =
    ga4.status.connected ||
    hubspot.status.connected ||
    posthog.status.connected ||
    searchConsole.status.connected ||
    googleAds.status.connected ||
    posthogTraffic.traffic !== null;
  if (!anyConnected) return null;

  // GA4 wins when connected; PostHog's own pageview/session data is only a
  // fallback for companies without GA4 (see trackWebsiteTraffic) -- the two
  // use different session-counting methodologies, so we never blend them.
  const traffic = ga4.traffic ?? posthogTraffic.traffic;
  const trafficSource = ga4.traffic ? "ga4" : posthogTraffic.traffic ? "posthog" : null;

  const funnel: FunnelStageValue[] = company.funnel.map((stage) => ({
    key: stage.key,
    label: stage.label,
    count: resolveFunnelValue(stage, { traffic, hubspot, posthog }),
  }));

  const allStatuses: SourceStatus[] = [
    ga4.status,
    hubspot.status,
    posthog.status,
    searchConsole.status,
    googleAds.status,
  ];
  const configuredSources: Record<SourceType, boolean> = {
    ga4: !!company.sources.ga4,
    hubspot: !!company.sources.hubspot,
    posthog: !!company.sources.posthog,
    searchconsole: !!company.sources.searchconsole,
    googleads: !!company.sources.googleads,
  };

  const metrics: DailyMetrics = {
    date: format(new Date(), "yyyy-MM-dd"),
    companyId: company.id,
    syncedAt: new Date().toISOString(),
    traffic,
    trafficSource,
    signups: posthog.signups,
    pipeline: hubspot.pipeline,
    searchConsole: searchConsole.searchConsole,
    googleAds: googleAds.googleAds,
    posthogRevenue: posthog.revenue,
    attributionFunnel: attributionFunnel.attributionFunnel,
    funnel,
    dealStageFunnel: hubspot.dealStageFunnel,
    sourceStatus: allStatuses.filter((s) => configuredSources[s.source]),
    sample: false,
  };

  // Full overwrite (no merge): each sync always produces a complete snapshot,
  // and merging would let a stale `sample: true` from an earlier seed persist
  // forever since this write wouldn't otherwise touch that field.
  await adminDb()
    .collection("companies")
    .doc(company.id)
    .collection("dailyMetrics")
    .doc(metrics.date)
    .set(metrics);

  return metrics;
}

export async function syncAllCompanies(days = 1): Promise<DailyMetrics[]> {
  const results = await Promise.all(portfolioCompanies.map((company) => syncCompany(company, days)));
  return results.filter((r): r is DailyMetrics => r !== null);
}
