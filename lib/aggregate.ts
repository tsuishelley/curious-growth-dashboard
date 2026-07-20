import type {
  DailyMetrics,
  FunnelStageValue,
  GoogleAdsMetrics,
  PipelineMetrics,
  PostHogRevenueMetrics,
  SearchConsoleMetrics,
  SignupMetrics,
  TrafficMetrics,
} from "@/lib/types";

/** Number of days in the period that actually had data for each source. */
export interface PeriodCoverage {
  traffic: number;
  signups: number;
  pipeline: number;
  searchConsole: number;
  googleAds: number;
  posthogRevenue: number;
}

export interface PeriodAggregate {
  traffic: TrafficMetrics | null;
  signups: SignupMetrics | null;
  pipeline: Pick<
    PipelineMetrics,
    "newContacts" | "newMqls" | "demosBooked" | "newDeals" | "newPipelineValue" | "wonDeals" | "wonValue"
  > | null;
  searchConsole: SearchConsoleMetrics | null;
  googleAds: GoogleAdsMetrics | null;
  posthogRevenue: PostHogRevenueMetrics | null;
  funnel: FunnelStageValue[];
  coverage: PeriodCoverage;
}

/**
 * A period-over-period % change is only meaningful when both periods cover a
 * comparable number of days. When one source (e.g. HubSpot) is backfilled for a
 * shorter window than another (e.g. GA4), the prior period can have just a day
 * or two of data at its boundary — comparing a full-period sum against that
 * produces absurd percentages (e.g. +1440%). Suppress the comparison unless the
 * prior period covers at least 80% as many days as the current period.
 */
export function comparableCoverage(currentDays: number, priorDays: number): boolean {
  return currentDays > 0 && priorDays >= currentDays * 0.8;
}

export function weekOverWeekChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return (current - previous) / previous;
}

function sumTraffic(entries: DailyMetrics[]): TrafficMetrics | null {
  const withTraffic = entries.flatMap((e) => (e.traffic ? [e.traffic] : []));
  if (withTraffic.length === 0) return null;

  const channelTotals = new Map<string, number>();
  const pageTotals = new Map<string, number>();
  for (const t of withTraffic) {
    for (const c of t.topChannels ?? []) channelTotals.set(c.channel, (channelTotals.get(c.channel) ?? 0) + c.sessions);
    for (const p of t.topPages ?? []) pageTotals.set(p.title, (pageTotals.get(p.title) ?? 0) + p.views);
  }

  // Aggregate the rich per-channel breakdown across days. Counts are summed;
  // engagementRate is recomputed from the summed engagedSessions/sessions rather
  // than averaged (a ratio isn't additive). Only days that carry a breakdown
  // (GA4 days, not the PostHog traffic fallback) contribute.
  const channelDetail = new Map<string, { sessions: number; users: number; newUsers: number; engagedSessions: number; conversions: number }>();
  for (const t of withTraffic) {
    for (const c of t.channelBreakdown ?? []) {
      const e = channelDetail.get(c.channel) ?? { sessions: 0, users: 0, newUsers: 0, engagedSessions: 0, conversions: 0 };
      channelDetail.set(c.channel, {
        sessions: e.sessions + c.sessions,
        users: e.users + c.users,
        newUsers: e.newUsers + c.newUsers,
        engagedSessions: e.engagedSessions + c.engagedSessions,
        conversions: e.conversions + c.conversions,
      });
    }
  }
  const channelBreakdown =
    channelDetail.size > 0
      ? [...channelDetail.entries()]
          .map(([channel, v]) => ({
            channel,
            sessions: v.sessions,
            users: v.users,
            newUsers: v.newUsers,
            engagedSessions: v.engagedSessions,
            engagementRate: v.sessions > 0 ? v.engagedSessions / v.sessions : 0,
            conversions: v.conversions,
          }))
          .sort((a, b) => b.sessions - a.sessions)
      : undefined;

  return {
    sessions: withTraffic.reduce((s, t) => s + t.sessions, 0),
    newUsers: withTraffic.reduce((s, t) => s + t.newUsers, 0),
    activeUsers: withTraffic.reduce((s, t) => s + t.activeUsers, 0),
    topChannels: [...channelTotals.entries()]
      .map(([channel, sessions]) => ({ channel, sessions }))
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 8),
    topPages: [...pageTotals.entries()]
      .map(([title, views]) => ({ title, views }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 8),
    channelBreakdown,
  };
}

function sumSignups(entries: DailyMetrics[]): SignupMetrics | null {
  const withSignups = entries.flatMap((e) => (e.signups ? [e.signups] : []));
  if (withSignups.length === 0) return null;

  const signups = withSignups.reduce((s, e) => s + e.signups, 0);
  const activatedUsers = withSignups.reduce((s, e) => s + e.activatedUsers, 0);
  return { signups, activatedUsers, activationRate: signups > 0 ? activatedUsers / signups : 0 };
}

function sumPipeline(entries: DailyMetrics[]): PeriodAggregate["pipeline"] {
  const withPipeline = entries.flatMap((e) => (e.pipeline ? [e.pipeline] : []));
  if (withPipeline.length === 0) return null;

  return {
    newContacts: withPipeline.reduce((s, p) => s + p.newContacts, 0),
    newMqls: withPipeline.reduce((s, p) => s + p.newMqls, 0),
    demosBooked: withPipeline.reduce((s, p) => s + (p.demosBooked ?? 0), 0),
    newDeals: withPipeline.reduce((s, p) => s + p.newDeals, 0),
    newPipelineValue: withPipeline.reduce((s, p) => s + p.newPipelineValue, 0),
    wonDeals: withPipeline.reduce((s, p) => s + p.wonDeals, 0),
    wonValue: withPipeline.reduce((s, p) => s + p.wonValue, 0),
  };
}

function sumSearchConsole(entries: DailyMetrics[]): SearchConsoleMetrics | null {
  const withSc = entries.flatMap((e) => (e.searchConsole ? [e.searchConsole] : []));
  if (withSc.length === 0) return null;

  const queryTotals = new Map<string, number>();
  for (const sc of withSc) {
    for (const q of sc.topQueries ?? []) queryTotals.set(q.query, (queryTotals.get(q.query) ?? 0) + q.clicks);
  }

  const clicks = withSc.reduce((s, sc) => s + sc.clicks, 0);
  const impressions = withSc.reduce((s, sc) => s + sc.impressions, 0);
  // Position isn't additive — average the daily averages as a reasonable summary.
  const position = withSc.reduce((s, sc) => s + sc.position, 0) / withSc.length;

  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : 0,
    position,
    topQueries: [...queryTotals.entries()]
      .map(([query, c]) => ({ query, clicks: c }))
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 8),
  };
}

function sumGoogleAds(entries: DailyMetrics[]): GoogleAdsMetrics | null {
  const withAds = entries.flatMap((e) => (e.googleAds ? [e.googleAds] : []));
  if (withAds.length === 0) return null;

  const campaignTotals = new Map<string, { cost: number; conversions: number }>();
  for (const a of withAds) {
    for (const c of a.topCampaigns ?? []) {
      const existing = campaignTotals.get(c.name) ?? { cost: 0, conversions: 0 };
      campaignTotals.set(c.name, { cost: existing.cost + c.cost, conversions: existing.conversions + c.conversions });
    }
  }

  const cost = withAds.reduce((s, a) => s + a.cost, 0);
  const clicks = withAds.reduce((s, a) => s + a.clicks, 0);
  const impressions = withAds.reduce((s, a) => s + a.impressions, 0);
  const conversions = withAds.reduce((s, a) => s + a.conversions, 0);
  const conversionValue = withAds.reduce((s, a) => s + a.conversionValue, 0);

  return {
    cost,
    clicks,
    impressions,
    conversions,
    conversionValue,
    cpc: clicks > 0 ? cost / clicks : 0,
    ctr: impressions > 0 ? clicks / impressions : 0,
    topCampaigns: [...campaignTotals.entries()]
      .map(([name, t]) => ({ name, cost: t.cost, conversions: t.conversions }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 8),
  };
}

function sumPosthogRevenue(entries: DailyMetrics[]): PostHogRevenueMetrics | null {
  const withRevenue = entries.flatMap((e) => (e.posthogRevenue ? [e.posthogRevenue] : []));
  if (withRevenue.length === 0) return null;

  return {
    amount: withRevenue.reduce((s, r) => s + r.amount, 0),
    count: withRevenue.reduce((s, r) => s + r.count, 0),
  };
}

function sumFunnel(entries: DailyMetrics[]): FunnelStageValue[] {
  if (entries.length === 0) return [];

  const totals = new Map<string, number>();
  for (const e of entries) {
    for (const stage of e.funnel) totals.set(stage.key, (totals.get(stage.key) ?? 0) + stage.count);
  }
  // Preserve stage order/labels from the most recent entry.
  return entries[entries.length - 1].funnel.map((stage) => ({
    key: stage.key,
    label: stage.label,
    count: totals.get(stage.key) ?? 0,
  }));
}

/**
 * Sums "new activity" metrics across a period of daily snapshots. Safe because
 * each stored day represents strictly that day's new activity (non-overlapping),
 * unlike `winRate`/`lostDeals`/`avgDaysToCloseDays`, which are already rolling
 * 30-day snapshots as of each sync and would double-count if summed — those are
 * read directly from the most recent day instead, not via this aggregate.
 */
export function aggregatePeriod(entries: DailyMetrics[]): PeriodAggregate {
  return {
    traffic: sumTraffic(entries),
    signups: sumSignups(entries),
    pipeline: sumPipeline(entries),
    searchConsole: sumSearchConsole(entries),
    googleAds: sumGoogleAds(entries),
    posthogRevenue: sumPosthogRevenue(entries),
    funnel: sumFunnel(entries),
    coverage: {
      traffic: entries.filter((e) => e.traffic).length,
      signups: entries.filter((e) => e.signups).length,
      pipeline: entries.filter((e) => e.pipeline).length,
      searchConsole: entries.filter((e) => e.searchConsole).length,
      googleAds: entries.filter((e) => e.googleAds).length,
      posthogRevenue: entries.filter((e) => e.posthogRevenue).length,
    },
  };
}
