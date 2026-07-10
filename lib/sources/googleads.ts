import { OAuth2Client } from "google-auth-library";
import {
  GOOGLE_ADS_CLIENT_ID_ENV,
  GOOGLE_ADS_CLIENT_SECRET_ENV,
  GOOGLE_ADS_DEVELOPER_TOKEN_ENV,
  GOOGLE_ADS_LOGIN_CUSTOMER_ID_ENV,
  GOOGLE_ADS_REFRESH_TOKEN_ENV,
  type PortfolioCompany,
} from "@/lib/config/portfolio";
import type { GoogleAdsMetrics, SourceStatus } from "@/lib/types";

const GOOGLE_ADS_API_BASE = "https://googleads.googleapis.com/v17";

let cachedClient: OAuth2Client | null = null;

// Unlike GA4/Search Console, the Ads API doesn't support simple service-account
// auth for third-party/agency access — this is a single OAuth refresh token
// belonging to one Google account that has Ads visibility into every portco's
// account (directly or via the shared manager/MCC account below).
function getClient(): OAuth2Client | null {
  const clientId = process.env[GOOGLE_ADS_CLIENT_ID_ENV];
  const clientSecret = process.env[GOOGLE_ADS_CLIENT_SECRET_ENV];
  const refreshToken = process.env[GOOGLE_ADS_REFRESH_TOKEN_ENV];
  if (!clientId || !clientSecret || !refreshToken) return null;
  if (cachedClient) return cachedClient;
  cachedClient = new OAuth2Client({ clientId, clientSecret });
  cachedClient.setCredentials({ refresh_token: refreshToken });
  return cachedClient;
}

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface GoogleAdsResult {
  status: SourceStatus;
  googleAds: GoogleAdsMetrics | null;
}

interface GoogleAdsSearchRow {
  campaign?: { name?: string };
  metrics?: {
    costMicros?: string;
    clicks?: string;
    impressions?: string;
    conversions?: number;
    conversionsValue?: number;
  };
}

/** Pulls Google Ads spend/clicks/conversions for the trailing `dateRangeDays` days via the shared OAuth refresh token. */
export async function fetchGoogleAdsMetrics(
  company: PortfolioCompany,
  dateRangeDays = 1
): Promise<GoogleAdsResult> {
  const config = company.sources.googleads;
  if (!config) {
    return { status: { source: "googleads", connected: false }, googleAds: null };
  }

  const customerId = process.env[config.customerIdEnv];
  const developerToken = process.env[GOOGLE_ADS_DEVELOPER_TOKEN_ENV];
  const loginCustomerId = process.env[GOOGLE_ADS_LOGIN_CUSTOMER_ID_ENV];
  const client = getClient();

  if (!customerId || !developerToken || !client) {
    return {
      status: {
        source: "googleads",
        connected: false,
        error: `Missing ${GOOGLE_ADS_DEVELOPER_TOKEN_ENV}, OAuth credentials, or ${config.customerIdEnv}`,
      },
      googleAds: null,
    };
  }

  try {
    const { token } = await client.getAccessToken();
    if (!token) throw new Error("Failed to obtain access token");

    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - (dateRangeDays - 1));

    const query = `
      SELECT campaign.name, metrics.cost_micros, metrics.clicks, metrics.impressions,
             metrics.conversions, metrics.conversions_value
      FROM campaign
      WHERE segments.date BETWEEN '${toDateString(startDate)}' AND '${toDateString(endDate)}'
    `;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "developer-token": developerToken,
      "Content-Type": "application/json",
    };
    if (loginCustomerId) headers["login-customer-id"] = loginCustomerId;

    const res = await fetch(`${GOOGLE_ADS_API_BASE}/customers/${customerId}/googleAds:search`, {
      method: "POST",
      headers,
      body: JSON.stringify({ query }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Google Ads query failed: ${res.status} ${body.slice(0, 200)}`);
    }

    const body = await res.json();
    const rows: GoogleAdsSearchRow[] = body.results ?? [];

    const campaignTotals = new Map<string, { cost: number; conversions: number }>();
    let cost = 0;
    let clicks = 0;
    let impressions = 0;
    let conversions = 0;
    let conversionValue = 0;

    for (const row of rows) {
      const rowCost = Number(row.metrics?.costMicros ?? 0) / 1_000_000;
      const rowClicks = Number(row.metrics?.clicks ?? 0);
      const rowImpressions = Number(row.metrics?.impressions ?? 0);
      const rowConversions = row.metrics?.conversions ?? 0;
      const rowConversionValue = row.metrics?.conversionsValue ?? 0;

      cost += rowCost;
      clicks += rowClicks;
      impressions += rowImpressions;
      conversions += rowConversions;
      conversionValue += rowConversionValue;

      const name = row.campaign?.name ?? "Unknown";
      const existing = campaignTotals.get(name) ?? { cost: 0, conversions: 0 };
      campaignTotals.set(name, { cost: existing.cost + rowCost, conversions: existing.conversions + rowConversions });
    }

    const topCampaigns = [...campaignTotals.entries()]
      .map(([name, t]) => ({ name, cost: t.cost, conversions: t.conversions }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 8);

    return {
      status: { source: "googleads", connected: true },
      googleAds: {
        cost,
        clicks,
        impressions,
        conversions,
        conversionValue,
        cpc: clicks > 0 ? cost / clicks : 0,
        ctr: impressions > 0 ? clicks / impressions : 0,
        topCampaigns,
      },
    };
  } catch (err) {
    return {
      status: {
        source: "googleads",
        connected: false,
        error: err instanceof Error ? err.message : "Google Ads fetch failed",
      },
      googleAds: null,
    };
  }
}
