/**
 * Reconstructs REAL historical daily metrics (not sample data) for the last
 * `BACKFILL_DAYS` days, using each connected source's own historical records:
 * GA4 retains historical traffic data, and HubSpot contacts/deals carry real
 * createdate/closedate timestamps regardless of when we started syncing.
 *
 * Never overwrites a day that already has a real (non-sample) doc — in
 * particular, today's live-synced doc is always left untouched (this script
 * only ever backfills days strictly older than today).
 *
 * Usage: npm run backfill:real [company-slug] [days]
 * Example: npm run backfill:real buildfire 180
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { format, subDays } from "date-fns";
import { BetaAnalyticsDataClient } from "@google-analytics/data";
import { adminDb } from "../lib/firebase/admin";
import {
  portfolioCompanies,
  getCompanyBySlug,
  GA4_SERVICE_ACCOUNT_ENV,
  type PortfolioCompany,
} from "../lib/config/portfolio";
import type { DailyMetrics, FunnelStageValue, PipelineMetrics, PostHogRevenueMetrics, TrafficMetrics } from "../lib/types";

const DEFAULT_BACKFILL_DAYS = 180;
// HubSpot contact/deal history beyond ~30 days looks contaminated by what
// appears to be a bulk Salesforce migration import (95k+ contacts in the last
// 180 days vs. ~10-12/day from the live sync). The last 30 days' volume,
// however, is consistent with the live sync rate, so we cap HubSpot backfill
// there rather than skipping it entirely or trusting the full requested range.
const BACKFILL_HUBSPOT = true;
const HUBSPOT_BACKFILL_DAYS = 30;
const CLOSED_DEALS_WINDOW_DAYS = 30;
const MQL_LIFECYCLE_STAGE = "marketingqualifiedlead";
const CLOSED_WON_STAGE = "closedwon";
const CLOSED_LOST_STAGE = "closedlost";
const HUBSPOT_API_BASE = "https://api.hubapi.com";

function ga4DateToIso(d: string): string {
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

// ---------- GA4 ----------

async function fetchGa4HistoricalByDay(
  company: PortfolioCompany,
  days: number
): Promise<Map<string, TrafficMetrics>> {
  const map = new Map<string, TrafficMetrics>();
  const config = company.sources.ga4;
  const credsJson = process.env[GA4_SERVICE_ACCOUNT_ENV];
  if (!config) return map;
  const propertyId = process.env[config.propertyIdEnv];
  if (!propertyId || !credsJson) return map;

  const client = new BetaAnalyticsDataClient({ credentials: JSON.parse(credsJson) });
  const dateRanges = [{ startDate: `${days}daysAgo`, endDate: "yesterday" }];

  const [summary, channels, pages] = await Promise.all([
    client.runReport({
      property: propertyId,
      dateRanges,
      dimensions: [{ name: "date" }],
      metrics: [{ name: "sessions" }, { name: "newUsers" }, { name: "activeUsers" }],
    }),
    client.runReport({
      property: propertyId,
      dateRanges,
      dimensions: [{ name: "date" }, { name: "sessionDefaultChannelGroup" }],
      metrics: [{ name: "sessions" }],
    }),
    client.runReport({
      property: propertyId,
      dateRanges,
      dimensions: [{ name: "date" }, { name: "unifiedScreenName" }],
      metrics: [{ name: "screenPageViews" }],
    }),
  ]);

  for (const row of summary[0].rows ?? []) {
    const date = ga4DateToIso(row.dimensionValues?.[0]?.value ?? "");
    map.set(date, {
      sessions: Number(row.metricValues?.[0]?.value ?? 0),
      newUsers: Number(row.metricValues?.[1]?.value ?? 0),
      activeUsers: Number(row.metricValues?.[2]?.value ?? 0),
      topChannels: [],
      topPages: [],
    });
  }

  const channelsByDate = new Map<string, { channel: string; sessions: number }[]>();
  for (const row of channels[0].rows ?? []) {
    const date = ga4DateToIso(row.dimensionValues?.[0]?.value ?? "");
    const channel = row.dimensionValues?.[1]?.value ?? "Unknown";
    const sessions = Number(row.metricValues?.[0]?.value ?? 0);
    const list = channelsByDate.get(date) ?? [];
    list.push({ channel, sessions });
    channelsByDate.set(date, list);
  }

  const pagesByDate = new Map<string, { title: string; views: number }[]>();
  for (const row of pages[0].rows ?? []) {
    const date = ga4DateToIso(row.dimensionValues?.[0]?.value ?? "");
    const title = row.dimensionValues?.[1]?.value ?? "Unknown";
    const views = Number(row.metricValues?.[0]?.value ?? 0);
    const list = pagesByDate.get(date) ?? [];
    list.push({ title, views });
    pagesByDate.set(date, list);
  }

  for (const [date, traffic] of map) {
    traffic.topChannels = (channelsByDate.get(date) ?? []).sort((a, b) => b.sessions - a.sessions).slice(0, 8);
    traffic.topPages = (pagesByDate.get(date) ?? []).sort((a, b) => b.views - a.views).slice(0, 8);
  }

  return map;
}

// ---------- HubSpot ----------

interface HubspotRecord {
  properties?: Record<string, string>;
}

async function searchAllPages(
  token: string,
  objectType: "contacts" | "deals",
  dateProperty: string,
  sinceMs: number,
  properties: string[]
): Promise<HubspotRecord[]> {
  const results: HubspotRecord[] = [];
  let after: string | undefined;

  do {
    const res = await fetch(`${HUBSPOT_API_BASE}/crm/v3/objects/${objectType}/search`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        filterGroups: [{ filters: [{ propertyName: dateProperty, operator: "GTE", value: String(sinceMs) }] }],
        properties,
        limit: 100,
        after,
      }),
    });
    if (!res.ok) throw new Error(`HubSpot ${objectType} search failed: ${res.status}`);
    const body = await res.json();
    results.push(...(body.results ?? []));
    after = body.paging?.next?.after;
  } while (after);

  return results;
}

async function fetchHubspotHistoricalByDay(
  company: PortfolioCompany,
  days: number
): Promise<Map<string, PipelineMetrics>> {
  const map = new Map<string, PipelineMetrics>();
  const config = company.sources.hubspot;
  if (!config) return map;
  const token = process.env[config.tokenEnv];
  if (!token) return map;

  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const sinceMs = Date.now() - days * MS_PER_DAY;
  const closedSinceMs = Date.now() - (days + CLOSED_DEALS_WINDOW_DAYS) * MS_PER_DAY;

  const [contacts, createdDeals, closedDeals] = await Promise.all([
    searchAllPages(token, "contacts", "createdate", sinceMs, ["createdate", "lifecyclestage"]),
    searchAllPages(token, "deals", "createdate", sinceMs, ["createdate", "dealstage", "amount"]),
    searchAllPages(token, "deals", "closedate", closedSinceMs, ["createdate", "closedate", "dealstage", "amount"]),
  ]);

  // HubSpot returns createdate/closedate as ISO date strings, not epoch numbers.
  const contactsByDay = new Map<string, HubspotRecord[]>();
  for (const c of contacts) {
    if (!c.properties?.createdate) continue;
    const day = format(new Date(c.properties.createdate), "yyyy-MM-dd");
    contactsByDay.set(day, [...(contactsByDay.get(day) ?? []), c]);
  }

  const dealsByDay = new Map<string, HubspotRecord[]>();
  for (const d of createdDeals) {
    if (!d.properties?.createdate) continue;
    const day = format(new Date(d.properties.createdate), "yyyy-MM-dd");
    dealsByDay.set(day, [...(dealsByDay.get(day) ?? []), d]);
  }

  for (let i = 0; i < days; i++) {
    const date = format(subDays(new Date(), days - i), "yyyy-MM-dd");
    const dayContacts = contactsByDay.get(date) ?? [];
    const dayDeals = dealsByDay.get(date) ?? [];

    const newContacts = dayContacts.length;
    const newMqls = dayContacts.filter(
      (c) => (c.properties?.lifecyclestage ?? "").toLowerCase() === MQL_LIFECYCLE_STAGE
    ).length;
    const newDeals = dayDeals.length;
    const newPipelineValue = dayDeals.reduce((sum, d) => sum + Number(d.properties?.amount ?? 0), 0);
    const wonDealsList = dayDeals.filter((d) => (d.properties?.dealstage ?? "").toLowerCase().includes(CLOSED_WON_STAGE));
    const wonDeals = wonDealsList.length;
    const wonValue = wonDealsList.reduce((sum, d) => sum + Number(d.properties?.amount ?? 0), 0);

    // Rolling 30-day-as-of-`date` window, computed from the one bulk fetch.
    const windowStartMs = new Date(date).getTime() - CLOSED_DEALS_WINDOW_DAYS * MS_PER_DAY;
    const windowEndMs = new Date(date).getTime() + MS_PER_DAY;
    const closedInWindow = closedDeals.filter((d) => {
      const closed = d.properties?.closedate ? new Date(d.properties.closedate).getTime() : NaN;
      return Number.isFinite(closed) && closed >= windowStartMs && closed < windowEndMs;
    });
    const closedWon = closedInWindow.filter((d) => (d.properties?.dealstage ?? "").toLowerCase().includes(CLOSED_WON_STAGE));
    const closedLost = closedInWindow.filter((d) => (d.properties?.dealstage ?? "").toLowerCase().includes(CLOSED_LOST_STAGE));
    const totalClosed = closedWon.length + closedLost.length;
    const winRate = totalClosed > 0 ? closedWon.length / totalClosed : null;
    const daysToCloseList = closedWon
      .map((d) => {
        const created = d.properties?.createdate ? new Date(d.properties.createdate).getTime() : NaN;
        const closed = d.properties?.closedate ? new Date(d.properties.closedate).getTime() : NaN;
        return Number.isFinite(created) && Number.isFinite(closed) ? (closed - created) / MS_PER_DAY : null;
      })
      .filter((v): v is number => v !== null);
    const avgDaysToCloseDays =
      daysToCloseList.length > 0 ? daysToCloseList.reduce((s, v) => s + v, 0) / daysToCloseList.length : null;

    map.set(date, {
      newContacts,
      newMqls,
      newDeals,
      newPipelineValue,
      wonDeals,
      wonValue,
      lostDeals: closedLost.length,
      winRate,
      avgDaysToCloseDays,
    });
  }

  return map;
}

// ---------- PostHog revenue ----------

const SAFE_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

async function fetchPosthogRevenueHistoricalByDay(
  company: PortfolioCompany,
  days: number
): Promise<Map<string, PostHogRevenueMetrics>> {
  const map = new Map<string, PostHogRevenueMetrics>();
  const config = company.sources.posthog;
  if (!config?.revenueEvent) return map;

  const apiKey = process.env[config.apiKeyEnv];
  const projectId = process.env[config.projectIdEnv];
  const host = (config.hostEnv && process.env[config.hostEnv]) || "https://app.posthog.com";
  if (!apiKey || !projectId) return map;

  const amountProperty = config.revenueAmountProperty ?? "amount";
  if (!SAFE_IDENTIFIER.test(amountProperty)) return map;
  if (config.revenueSourceFilter && !SAFE_IDENTIFIER.test(config.revenueSourceFilter.property)) return map;

  const filterClause = config.revenueSourceFilter
    ? `and properties.${config.revenueSourceFilter.property} = {filterValue}`
    : "";

  const res = await fetch(`${host}/api/projects/${projectId}/query/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      query: {
        kind: "HogQLQuery",
        // PostHog's query API caps results at 100 rows without an explicit
        // ORDER BY + LIMIT, which silently drops recent days for any window
        // over ~100 days -- always specify both.
        query: `select toDate(timestamp) as day, count(), sum(toFloat(properties.${amountProperty}))
                from events
                where event = {event} and timestamp >= now() - interval ${days} day ${filterClause}
                group by day order by day desc limit ${days + 10}`,
        values: { event: config.revenueEvent, filterValue: config.revenueSourceFilter?.value },
      },
    }),
  });
  if (!res.ok) return map;

  const body = await res.json();
  for (const row of body.results ?? []) {
    const [day, count, amount] = row as [string, number, number];
    map.set(String(day).slice(0, 10), { count: Number(count ?? 0), amount: Number(amount ?? 0) });
  }
  return map;
}

// ---------- PostHog website traffic (fallback when GA4 isn't connected) ----------

async function posthogQuery(host: string, projectId: string, apiKey: string, hogql: string, values?: Record<string, unknown>) {
  const res = await fetch(`${host}/api/projects/${projectId}/query/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query: hogql, values } }),
  });
  if (!res.ok) return [];
  const body = await res.json();
  return body.results ?? [];
}

/** Mirrors lib/sources/posthogTraffic.ts but grouped by day across the whole window, for historical backfill. */
async function fetchPosthogTrafficHistoricalByDay(
  company: PortfolioCompany,
  days: number
): Promise<Map<string, TrafficMetrics>> {
  const map = new Map<string, TrafficMetrics>();
  const config = company.sources.posthog;
  if (!config?.trackWebsiteTraffic) return map;

  const apiKey = process.env[config.apiKeyEnv];
  const projectId = process.env[config.projectIdEnv];
  const host = (config.hostEnv && process.env[config.hostEnv]) || "https://app.posthog.com";
  if (!apiKey || !projectId) return map;

  // PostHog's query API silently caps results at 100 rows with no ORDER BY,
  // which for a >100-day window returns an arbitrary (often oldest-first)
  // slice rather than the full range -- every grouped-by-day query here needs
  // an explicit ORDER BY + a LIMIT comfortably above `days` (and, for the
  // per-day-per-dimension breakdowns, above `days * ~15` since each day can
  // have multiple page/channel rows).
  const dayLimit = days + 10;
  const [sessionsRows, newUsersRows, activeUsersRows, pagesRows, channelsRows] = await Promise.all([
    posthogQuery(host, projectId, apiKey,
      `select toDate($start_timestamp) as day, count() as c from sessions
       where $start_timestamp >= now() - interval ${days} day
       group by day order by day desc limit ${dayLimit}`),
    posthogQuery(host, projectId, apiKey,
      `select toDate(first_seen) as day, count() as c from (
         select person_id, min(timestamp) as first_seen from events where event = '$pageview' group by person_id
       ) where first_seen >= now() - interval ${days} day
       group by day order by day desc limit ${dayLimit}`),
    posthogQuery(host, projectId, apiKey,
      `select toDate(timestamp) as day, count(distinct person_id) as c from events
       where event = '$pageview' and timestamp >= now() - interval ${days} day
       group by day order by day desc limit ${dayLimit}`),
    config.marketingHosts && config.marketingHosts.length > 0
      ? posthogQuery(
          host, projectId, apiKey,
          `select toDate(timestamp) as day, properties.$pathname as path, count() as c from events
           where event = '$pageview' and timestamp >= now() - interval ${days} day
           and properties.$host in {hosts}
           group by day, path order by day desc, c desc limit ${dayLimit * 20}`,
          { hosts: config.marketingHosts }
        )
      : Promise.resolve([]),
    posthogQuery(host, projectId, apiKey,
      `select toDate($start_timestamp) as day, $channel_type as channel, count() as c from sessions
       where $start_timestamp >= now() - interval ${days} day
       group by day, channel order by day desc, c desc limit ${dayLimit * 10}`),
  ]);

  const sessionsByDay = new Map<string, number>();
  for (const [day, c] of sessionsRows as [string, number][]) sessionsByDay.set(String(day).slice(0, 10), Number(c));

  const newUsersByDay = new Map<string, number>();
  for (const [day, c] of newUsersRows as [string, number][]) newUsersByDay.set(String(day).slice(0, 10), Number(c));

  const activeUsersByDay = new Map<string, number>();
  for (const [day, c] of activeUsersRows as [string, number][]) activeUsersByDay.set(String(day).slice(0, 10), Number(c));

  const pagesByDay = new Map<string, { title: string; views: number }[]>();
  for (const [day, path, c] of pagesRows as [string, string | null, number][]) {
    if (!path) continue;
    const key = String(day).slice(0, 10);
    const list = pagesByDay.get(key) ?? [];
    list.push({ title: path, views: Number(c) });
    pagesByDay.set(key, list);
  }

  const channelsByDay = new Map<string, { channel: string; sessions: number }[]>();
  for (const [day, channel, c] of channelsRows as [string, string | null, number][]) {
    if (!channel) continue;
    const key = String(day).slice(0, 10);
    const list = channelsByDay.get(key) ?? [];
    list.push({ channel, sessions: Number(c) });
    channelsByDay.set(key, list);
  }

  const allDays = new Set([...sessionsByDay.keys(), ...activeUsersByDay.keys(), ...newUsersByDay.keys()]);
  for (const day of allDays) {
    map.set(day, {
      sessions: sessionsByDay.get(day) ?? 0,
      newUsers: newUsersByDay.get(day) ?? 0,
      activeUsers: activeUsersByDay.get(day) ?? 0,
      topPages: (pagesByDay.get(day) ?? []).sort((a, b) => b.views - a.views).slice(0, 8),
      topChannels: (channelsByDay.get(day) ?? []).sort((a, b) => b.sessions - a.sessions).slice(0, 8),
    });
  }

  return map;
}

// ---------- Combine + write ----------

function buildFunnel(company: PortfolioCompany, traffic: TrafficMetrics | null, pipeline: PipelineMetrics | null): FunnelStageValue[] {
  return company.funnel.map((stage) => {
    let count = 0;
    if (stage.source === "ga4") count = traffic?.sessions ?? 0;
    else if (stage.source === "hubspot") {
      if (stage.key === "mql") count = pipeline?.newMqls ?? 0;
      else if (stage.key === "customer") count = pipeline?.wonDeals ?? 0;
      else count = pipeline?.newContacts ?? 0;
    }
    return { key: stage.key, label: stage.label, count };
  });
}

async function backfillCompany(company: PortfolioCompany, days: number) {
  const hasGa4 = !!company.sources.ga4;
  const hasHubspot = !!company.sources.hubspot && BACKFILL_HUBSPOT;
  const hasPosthogRevenue = !!company.sources.posthog?.revenueEvent;
  const hasPosthogTraffic = !!company.sources.posthog?.trackWebsiteTraffic;

  if (!hasGa4 && !hasHubspot && !hasPosthogRevenue && !hasPosthogTraffic) {
    console.log(`${company.name}: nothing backfillable configured, skipping.`);
    return;
  }

  console.log(
    `${company.name}: fetching ${days} days of GA4 history + ${HUBSPOT_BACKFILL_DAYS} days of HubSpot history` +
      (hasPosthogRevenue ? ` + ${days} days of PostHog revenue history` : "") +
      (hasPosthogTraffic ? ` + ${days} days of PostHog traffic history` : "") +
      "..."
  );
  const [ga4TrafficByDay, pipelineByDay, revenueByDay, posthogTrafficByDay] = await Promise.all([
    hasGa4 ? fetchGa4HistoricalByDay(company, days) : Promise.resolve(new Map<string, TrafficMetrics>()),
    hasHubspot
      ? fetchHubspotHistoricalByDay(company, HUBSPOT_BACKFILL_DAYS)
      : Promise.resolve(new Map<string, PipelineMetrics>()),
    hasPosthogRevenue
      ? fetchPosthogRevenueHistoricalByDay(company, days)
      : Promise.resolve(new Map<string, PostHogRevenueMetrics>()),
    hasPosthogTraffic
      ? fetchPosthogTrafficHistoricalByDay(company, days)
      : Promise.resolve(new Map<string, TrafficMetrics>()),
  ]);

  const collectionRef = adminDb().collection("companies").doc(company.id).collection("dailyMetrics");
  const existingSnap = await collectionRef.get();
  // Only protect days written by the LIVE daily sync (real, not sample, not
  // itself a prior backfill run) — those must never be touched. Sample-seeded
  // days and previously-backfilled days are safe to overwrite/enhance.
  const protectedDates = new Set(
    existingSnap.docs
      .filter((d) => {
        const data = d.data();
        return data.sample !== true && data.backfilled !== true;
      })
      .map((d) => d.id)
  );

  const batch = adminDb().batch();
  let written = 0;
  let skipped = 0;

  for (let i = 1; i <= days; i++) {
    const date = format(subDays(new Date(), i), "yyyy-MM-dd");
    if (protectedDates.has(date)) {
      skipped++;
      continue;
    }

    const ga4Traffic = ga4TrafficByDay.get(date) ?? null;
    const posthogTraffic = posthogTrafficByDay.get(date) ?? null;
    const traffic = ga4Traffic ?? posthogTraffic;
    const trafficSource = ga4Traffic ? "ga4" : posthogTraffic ? "posthog" : null;
    const pipeline = pipelineByDay.get(date) ?? null;
    const posthogRevenue = revenueByDay.get(date) ?? null;
    if (!traffic && !pipeline && !posthogRevenue) continue; // nothing real to write for this day

    const metrics: DailyMetrics = {
      date,
      companyId: company.id,
      syncedAt: new Date().toISOString(),
      traffic,
      trafficSource,
      signups: null,
      pipeline,
      searchConsole: null, // not backfilled yet
      googleAds: null, // not backfilled yet
      posthogRevenue,
      attributionFunnel: null, // point-in-time snapshot only, not backfillable historically
      funnel: buildFunnel(company, traffic, pipeline),
      dealStageFunnel: null, // can't reconstruct a historical point-in-time snapshot
      sourceStatus: [
        ...(hasGa4 ? [{ source: "ga4" as const, connected: ga4Traffic !== null }] : []),
        ...(hasHubspot ? [{ source: "hubspot" as const, connected: pipeline !== null }] : []),
        ...(hasPosthogRevenue || hasPosthogTraffic
          ? [{ source: "posthog" as const, connected: posthogRevenue !== null || posthogTraffic !== null }]
          : []),
      ],
      sample: false,
      backfilled: true,
    };

    batch.set(collectionRef.doc(date), metrics);
    written++;
  }

  if (written > 0) await batch.commit();
  console.log(`${company.name}: wrote ${written} real historical day(s), skipped ${skipped} already-real day(s).`);
}

async function main() {
  const [slugArg, daysArg] = process.argv.slice(2);
  const days = daysArg ? Number(daysArg) : DEFAULT_BACKFILL_DAYS;
  const targets = slugArg ? [getCompanyBySlug(slugArg)].filter((c): c is PortfolioCompany => !!c) : portfolioCompanies;

  if (slugArg && targets.length === 0) {
    console.error(`Unknown company slug "${slugArg}".`);
    process.exit(1);
  }

  for (const company of targets) {
    await backfillCompany(company, days);
  }
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
