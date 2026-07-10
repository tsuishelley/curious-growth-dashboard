import { JWT } from "google-auth-library";
import { GA4_SERVICE_ACCOUNT_ENV, type PortfolioCompany } from "@/lib/config/portfolio";
import type { SearchConsoleMetrics, SourceStatus } from "@/lib/types";

const SEARCH_CONSOLE_API_BASE = "https://www.googleapis.com/webmasters/v3";
// Search Console data isn't available same-day — Google typically has a 2-3
// day processing lag, so we always query a window ending a few days back
// rather than "today"/"yesterday" like GA4.
const REPORTING_LAG_DAYS = 3;

let cachedClient: JWT | null = null;

function getClient(): JWT | null {
  const credsJson = process.env[GA4_SERVICE_ACCOUNT_ENV];
  if (!credsJson) return null;
  if (cachedClient) return cachedClient;
  const credentials = JSON.parse(credsJson);
  cachedClient = new JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
  });
  return cachedClient;
}

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface SearchConsoleResult {
  status: SourceStatus;
  searchConsole: SearchConsoleMetrics | null;
}

/** Pulls Search Console clicks/impressions/CTR/position for the trailing `dateRangeDays` days via the shared GA4 service account. */
export async function fetchSearchConsoleMetrics(
  company: PortfolioCompany,
  dateRangeDays = 1
): Promise<SearchConsoleResult> {
  const config = company.sources.searchconsole;
  if (!config) {
    return { status: { source: "searchconsole", connected: false }, searchConsole: null };
  }

  const siteUrl = process.env[config.siteUrlEnv];
  const client = getClient();

  if (!siteUrl || !client) {
    return {
      status: {
        source: "searchconsole",
        connected: false,
        error: `Missing ${GA4_SERVICE_ACCOUNT_ENV} or ${config.siteUrlEnv}`,
      },
      searchConsole: null,
    };
  }

  try {
    const { token } = await client.getAccessToken();
    if (!token) throw new Error("Failed to obtain access token");

    const endDate = new Date();
    endDate.setDate(endDate.getDate() - REPORTING_LAG_DAYS);
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - (dateRangeDays - 1));

    const body = { startDate: toDateString(startDate), endDate: toDateString(endDate) };
    const endpoint = `${SEARCH_CONSOLE_API_BASE}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;

    const [summaryRes, queriesRes] = await Promise.all([
      fetch(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      fetch(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, dimensions: ["query"], rowLimit: 25 }),
      }),
    ]);

    if (!summaryRes.ok) throw new Error(`Search Console summary query failed: ${summaryRes.status}`);
    if (!queriesRes.ok) throw new Error(`Search Console query breakdown failed: ${queriesRes.status}`);

    const summaryBody = await summaryRes.json();
    const queriesBody = await queriesRes.json();
    const summaryRow = summaryBody.rows?.[0];

    const topQueries = (queriesBody.rows ?? [])
      .map((r: { keys?: string[]; clicks?: number }) => ({ query: r.keys?.[0] ?? "Unknown", clicks: r.clicks ?? 0 }))
      .sort((a: { clicks: number }, b: { clicks: number }) => b.clicks - a.clicks)
      .slice(0, 8);

    return {
      status: { source: "searchconsole", connected: true },
      searchConsole: {
        clicks: summaryRow?.clicks ?? 0,
        impressions: summaryRow?.impressions ?? 0,
        ctr: summaryRow?.ctr ?? 0,
        position: summaryRow?.position ?? 0,
        topQueries,
      },
    };
  } catch (err) {
    return {
      status: {
        source: "searchconsole",
        connected: false,
        error: err instanceof Error ? err.message : "Search Console fetch failed",
      },
      searchConsole: null,
    };
  }
}
