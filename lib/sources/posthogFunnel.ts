import type { PortfolioCompany } from "@/lib/config/portfolio";
import type { AttributionFunnelMetrics, FunnelStageValue } from "@/lib/types";

const DEFAULT_HOST = "https://app.posthog.com";

interface FunnelStepResult {
  name?: string;
  custom_name?: string;
  breakdown_value?: string[] | string;
  count?: number;
}

export interface AttributionFunnelResult {
  attributionFunnel: AttributionFunnelMetrics | null;
}

/**
 * Re-runs a company's saved PostHog funnel Insight (identified by short_id) over
 * the trailing `dateRangeDays` days, aggregated across its own channel breakdown.
 * This is a supplementary, company-specific chart -- any failure (missing config,
 * API error, insight not found) just means it's skipped, never affects the rest
 * of the sync.
 */
export async function fetchAttributionFunnel(
  company: PortfolioCompany,
  dateRangeDays = 30
): Promise<AttributionFunnelResult> {
  const config = company.sources.posthog;
  const insightId = config?.attributionFunnelInsightId;
  if (!config || !insightId) return { attributionFunnel: null };

  const apiKey = process.env[config.apiKeyEnv];
  const projectId = process.env[config.projectIdEnv];
  const host = (config.hostEnv && process.env[config.hostEnv]) || DEFAULT_HOST;
  if (!apiKey || !projectId) return { attributionFunnel: null };

  try {
    const insightRes = await fetch(`${host}/api/projects/${projectId}/insights/?short_id=${insightId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!insightRes.ok) return { attributionFunnel: null };
    const insightBody = await insightRes.json();
    const insight = insightBody.results?.[0];
    const query = insight?.query?.source;
    if (!query) return { attributionFunnel: null };
    const insightName: string = insight.name || insight.derived_name || "Attribution Funnel";

    // Override the saved date range so this matches the rest of the dashboard's
    // trailing-N-day convention, rather than whatever window was last saved in PostHog.
    query.dateRange = { date_from: `-${dateRangeDays}d` };

    const queryRes = await fetch(`${host}/api/projects/${projectId}/query/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    if (!queryRes.ok) return { attributionFunnel: null };
    const queryBody = await queryRes.json();
    const rawResults: unknown[] = queryBody.results ?? [];
    if (rawResults.length === 0) return { attributionFunnel: null };

    // PostHog returns a flat FunnelStepResult[] for a plain funnel, or a
    // FunnelStepResult[][] (one array per breakdown value, e.g. per channel)
    // when the Insight has a breakdown configured -- normalize both shapes.
    const series: FunnelStepResult[][] = Array.isArray(rawResults[0])
      ? (rawResults as FunnelStepResult[][])
      : [rawResults as FunnelStepResult[]];
    if (series[0].length === 0) return { attributionFunnel: null };

    const stepCount = series[0].length;
    const steps: FunnelStageValue[] = Array.from({ length: stepCount }, (_, i) => {
      const label = series[0][i]?.custom_name ?? series[0][i]?.name ?? `Step ${i + 1}`;
      const count = series.reduce((sum, s) => sum + (s[i]?.count ?? 0), 0);
      return { key: `step-${i}`, label, count };
    });

    // Only a breakdown-configured Insight has a meaningful per-channel table;
    // a single plain funnel has nothing to break down.
    const hasBreakdown = series.length > 1 || series[0][0]?.breakdown_value !== undefined;
    const byChannel = hasBreakdown
      ? series
          .map((s) => {
            const rawChannel = s[0]?.breakdown_value;
            const channel = Array.isArray(rawChannel) ? rawChannel[0] ?? "Unknown" : rawChannel ?? "Unknown";
            const visited = s[0]?.count ?? 0;
            const converted = s[s.length - 1]?.count ?? 0;
            return { channel, visited, converted, conversionRate: visited > 0 ? converted / visited : 0 };
          })
          .sort((a, b) => b.visited - a.visited)
      : [];

    return { attributionFunnel: { insightName, steps, byChannel } };
  } catch {
    return { attributionFunnel: null };
  }
}
