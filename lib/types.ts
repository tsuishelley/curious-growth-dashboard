import type { SourceType } from "@/lib/config/portfolio";

export interface TrafficMetrics {
  sessions: number;
  newUsers: number;
  activeUsers: number;
  topChannels: { channel: string; sessions: number }[];
  topPages: { title: string; views: number }[];
}

export interface SignupMetrics {
  signups: number;
  activatedUsers: number;
  /**
   * Legacy same-window event ratio: activation events / signup events counted
   * independently over the period. Can exceed 1 (e.g. existing users activating
   * this period inflate the numerator), so it is NOT a real conversion rate and
   * is no longer what the dashboard displays — kept only for backward compat with
   * insights/sample data. Prefer `cohortActivationRate`.
   */
  activationRate: number;
  /**
   * Cohort activation over a fixed trailing 30-day window: of the distinct persons
   * who signed up in that window, the share who have since fired the activation
   * event. A true cohort conversion, so always 0–1. Rolling snapshot (like
   * `PipelineMetrics.winRate`) — read from the latest day, never summed across days.
   * `null` when there were no signups in the window. Optional so daily snapshots
   * written before this field existed still parse.
   */
  cohortActivationRate?: number | null;
  /** Distinct persons who signed up within the cohort window (denominator of `cohortActivationRate`). */
  cohortSignups?: number;
  /** Of `cohortSignups`, the distinct count who have since activated (numerator). */
  cohortActivated?: number;
}

export interface PipelineMetrics {
  newContacts: number;
  newMqls: number;
  /** Meetings/demos booked in the period (HubSpot meeting engagements created in the window). Bridges the marketing funnel (MQL) to the sales funnel (deals). Optional so pipeline docs stored before this field existed still parse. */
  demosBooked?: number;
  newDeals: number;
  newPipelineValue: number;
  wonDeals: number;
  wonValue: number;
  /** Deals that closed lost in the period (used with wonDeals for win rate). */
  lostDeals: number;
  /** wonDeals / (wonDeals + lostDeals) among deals that closed in the period; null if none closed. */
  winRate: number | null;
  /** Average days from deal creation to close, among deals won in the period; null if none closed won. */
  avgDaysToCloseDays: number | null;
}

export interface SearchConsoleMetrics {
  clicks: number;
  impressions: number;
  ctr: number; // 0-1
  position: number; // average position, lower is better
  topQueries: { query: string; clicks: number }[];
}

export interface PostHogRevenueMetrics {
  amount: number;
  count: number;
}

export interface AttributionFunnelMetrics {
  /** The saved PostHog Insight's own name -- used as the chart title so it stays accurate per-company without duplicating it in config. */
  insightName: string;
  /** Ordered funnel steps (e.g. marketing visit -> signup -> ... -> paid), aggregated across all channel breakdowns. */
  steps: FunnelStageValue[];
  /**
   * The same funnel segmented by acquisition channel (Direct, Organic Search, ...),
   * from the PostHog Insight's own breakdown. `steps` here is the full per-channel
   * progression in the same order as the top-level `steps`, so step i lines up across
   * both. Empty if the Insight has no breakdown configured.
   */
  byChannel: { channel: string; steps: FunnelStageValue[] }[];
}

export interface GoogleAdsMetrics {
  cost: number; // spend in the account's currency
  clicks: number;
  impressions: number;
  conversions: number;
  conversionValue: number;
  cpc: number; // cost / clicks, 0 if no clicks
  ctr: number; // 0-1
  topCampaigns: { name: string; cost: number; conversions: number }[];
}

export interface FunnelStageValue {
  key: string;
  label: string;
  count: number;
}

export interface SourceStatus {
  source: SourceType;
  connected: boolean;
  error?: string;
}

export interface WeeklyInsight {
  weekId: string; // e.g. "2026-W27" (ISO week)
  companyId: string;
  generatedAt: string; // ISO timestamp
  /** Markdown bullet summary produced by Claude. */
  summary: string;
  model: string;
}

export interface DailyMetrics {
  date: string; // yyyy-mm-dd
  companyId: string;
  syncedAt: string; // ISO timestamp
  traffic: TrafficMetrics | null;
  /** Which source actually supplied `traffic` -- "ga4" if connected, else "posthog" as a fallback (see CompanySourceConfig.posthog.trackWebsiteTraffic), else null. Lets the UI show an accurate "Source: X" label instead of assuming GA4. */
  trafficSource: SourceType | null;
  signups: SignupMetrics | null;
  pipeline: PipelineMetrics | null;
  searchConsole: SearchConsoleMetrics | null;
  googleAds: GoogleAdsMetrics | null;
  /** Real revenue summed from a configured PostHog event (e.g. Stripe-sourced payment events), for PLG companies with no HubSpot pipeline. */
  posthogRevenue: PostHogRevenueMetrics | null;
  /** Company-specific saved PostHog funnel Insight (e.g. Convox's marketing->paid attribution funnel), if configured. */
  attributionFunnel: AttributionFunnelMetrics | null;
  funnel: FunnelStageValue[];
  /** Full HubSpot deal-pipeline-stage breakdown (snapshot of currently open deals per stage), for companies with HubSpot connected. */
  dealStageFunnel: FunnelStageValue[] | null;
  sourceStatus: SourceStatus[];
  sample?: boolean; // true if this is seeded/sample data, not a real sync
  /** true if this doc was written by the historical backfill script, not the live daily sync — lets the backfill script safely re-run/enhance its own prior output without ever touching a real live-synced day. */
  backfilled?: boolean;
}
