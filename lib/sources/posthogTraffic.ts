import type { PortfolioCompany } from "@/lib/config/portfolio";
import type { TrafficMetrics } from "@/lib/types";

const DEFAULT_HOST = "https://app.posthog.com";

export interface PosthogTrafficResult {
  traffic: TrafficMetrics | null;
}

async function runQuery(
  host: string,
  projectId: string,
  apiKey: string,
  hogql: string,
  values?: Record<string, unknown>
): Promise<unknown[]> {
  const res = await fetch(`${host}/api/projects/${projectId}/query/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query: hogql, values } }),
  });
  if (!res.ok) throw new Error(`PostHog traffic query failed: ${res.status}`);
  const body = await res.json();
  return body.results ?? [];
}

/**
 * Computes website traffic (sessions, new/active users, top pages, channel mix)
 * directly from PostHog's own $pageview/session data, for companies with no GA4
 * connected yet (see CompanySourceConfig.posthog.trackWebsiteTraffic). Channel
 * mix comes from PostHog's `sessions` table, not the `events` table -- channel
 * type is a session-level derived property, not a literal event property.
 */
export async function fetchPosthogTraffic(company: PortfolioCompany, days = 1): Promise<PosthogTrafficResult> {
  const config = company.sources.posthog;
  if (!config?.trackWebsiteTraffic) return { traffic: null };

  const apiKey = process.env[config.apiKeyEnv];
  const projectId = process.env[config.projectIdEnv];
  const host = (config.hostEnv && process.env[config.hostEnv]) || DEFAULT_HOST;
  if (!apiKey || !projectId) return { traffic: null };

  try {
    const [sessionsRows, newUsersRows, activeUsersRows, pagesRows, channelsRows] = await Promise.all([
      runQuery(host, projectId, apiKey, `select count() from sessions where $start_timestamp >= now() - interval ${days} day`),
      runQuery(
        host,
        projectId,
        apiKey,
        `select count() from (
           select person_id, min(timestamp) as first_seen from events where event = '$pageview' group by person_id
         ) where first_seen >= now() - interval ${days} day`
      ),
      runQuery(
        host,
        projectId,
        apiKey,
        `select count(distinct person_id) from events where event = '$pageview' and timestamp >= now() - interval ${days} day`
      ),
      // Only meaningful with marketingHosts configured -- without it, raw
      // pageviews are dominated by the product/app itself, not marketing
      // content, so we skip this query entirely rather than show that.
      config.marketingHosts && config.marketingHosts.length > 0
        ? runQuery(
            host,
            projectId,
            apiKey,
            `select properties.$pathname, count() as c from events
             where event = '$pageview' and timestamp >= now() - interval ${days} day
             and properties.$host in {hosts}
             group by properties.$pathname order by c desc limit 8`,
            { hosts: config.marketingHosts }
          )
        : Promise.resolve([]),
      runQuery(
        host,
        projectId,
        apiKey,
        `select $channel_type, count() as c from sessions
         where $start_timestamp >= now() - interval ${days} day
         group by $channel_type order by c desc limit 8`
      ),
    ]);

    const sessions = Number((sessionsRows[0] as number[])?.[0] ?? 0);
    const newUsers = Number((newUsersRows[0] as number[])?.[0] ?? 0);
    const activeUsers = Number((activeUsersRows[0] as number[])?.[0] ?? 0);

    const topPages = (pagesRows as [string | null, number][])
      .filter(([path]) => path)
      .map(([path, views]) => ({ title: path as string, views: Number(views) }));

    const topChannels = (channelsRows as [string | null, number][])
      .filter(([channel]) => channel)
      .map(([channel, count]) => ({ channel: channel as string, sessions: Number(count) }));

    return {
      traffic: { sessions, newUsers, activeUsers, topChannels, topPages },
    };
  } catch {
    return { traffic: null };
  }
}
