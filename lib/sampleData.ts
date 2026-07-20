import { format, subDays } from "date-fns";
import { type PortfolioCompany, type FunnelStage } from "@/lib/config/portfolio";
import type { DailyMetrics, FunnelStageValue } from "@/lib/types";

export const SAMPLE_DAYS = 30;

function randomBetween(min: number, max: number): number {
  return Math.round(min + Math.random() * (max - min));
}

function seededDay(dayIndex: number, base: number, growthPerDay: number, noisePct: number): number {
  const weekendDip = [0, 6].includes((dayIndex + 3) % 7) ? 0.75 : 1; // Sat/Sun ~ lighter traffic
  const trend = base + growthPerDay * dayIndex;
  const noise = 1 + (Math.random() - 0.5) * noisePct;
  return Math.max(0, Math.round(trend * weekendDip * noise));
}

function buildFunnel(company: PortfolioCompany, values: Record<string, number>): FunnelStageValue[] {
  return company.funnel.map((stage: FunnelStage) => ({
    key: stage.key,
    label: stage.label,
    count: values[stage.key] ?? 0,
  }));
}

const SAMPLE_DEAL_STAGES = [
  "Appointment Scheduled",
  "Qualified to Buy",
  "Presentation Scheduled",
  "Decision Maker Bought-In",
  "Contract Sent",
  "Closed Won",
];

function buildDealStageFunnel(openDealCount: number): FunnelStageValue[] {
  let remaining = openDealCount;
  return SAMPLE_DEAL_STAGES.map((label, i) => {
    const isLast = i === SAMPLE_DEAL_STAGES.length - 1;
    const count = isLast ? remaining : Math.round(remaining * (randomBetween(45, 70) / 100));
    remaining = Math.max(0, remaining - count);
    return { key: label.toLowerCase().replace(/\s+/g, "-"), label, count };
  });
}

/** Generates one day of realistic-looking sample metrics for a company. Always marked `sample: true`. */
export function generateDailyMetrics(company: PortfolioCompany, dayIndex: number, date: string): DailyMetrics {
  const hasGa4 = !!company.sources.ga4;
  const hasHubspot = !!company.sources.hubspot;
  const hasPosthog = !!company.sources.posthog;
  const hasSearchConsole = !!company.sources.searchconsole;

  const sessions = hasGa4 ? seededDay(dayIndex, 800, 6, 0.25) : 0;
  const newUsers = hasGa4 ? Math.round((sessions * randomBetween(30, 45)) / 100) : 0;
  const activeUsers = hasGa4 ? Math.round(newUsers * 1.4) : 0;

  const channelBreakdown = hasGa4
    ? ([
        ["Organic Search", 0.4],
        ["Direct", 0.25],
        ["Referral", 0.2],
        ["Paid Search", 0.15],
      ] as [string, number][]).map(([channel, share]) => {
        const cs = Math.round(sessions * share);
        const engagementRate = randomBetween(45, 72) / 100;
        return {
          channel,
          sessions: cs,
          users: Math.round((cs * randomBetween(75, 92)) / 100),
          newUsers: Math.round((cs * randomBetween(28, 45)) / 100),
          engagedSessions: Math.round(cs * engagementRate),
          engagementRate,
          conversions: Math.round((cs * randomBetween(1, 4)) / 100),
        };
      })
    : [];

  const signups = hasPosthog ? Math.round((sessions * randomBetween(4, 9)) / 100) : 0;
  const activatedUsers = hasPosthog ? Math.round((signups * randomBetween(35, 65)) / 100) : 0;

  // Cohort activation reflects a trailing 30-day signup cohort (not this single
  // day), so it's a much larger denominator than the daily `signups` above and,
  // being a real conversion, always resolves to 0–1 — mirrors the live PostHog
  // integration's rolling cohort window.
  const cohortSignups = hasPosthog ? Math.round(signups * randomBetween(20, 30)) : 0;
  const cohortActivationRate = hasPosthog && cohortSignups > 0 ? randomBetween(30, 60) / 100 : null;
  const cohortActivated = cohortActivationRate !== null ? Math.round(cohortSignups * cohortActivationRate) : 0;

  const newContacts = hasHubspot ? seededDay(dayIndex, 12, 0.15, 0.4) : 0;
  const newMqls = hasHubspot ? Math.round((newContacts * randomBetween(20, 35)) / 100) : 0;
  const demosBooked = hasHubspot ? Math.round((newMqls * randomBetween(40, 70)) / 100) : 0;
  const newDeals = hasHubspot ? Math.round((newMqls * randomBetween(30, 50)) / 100) : 0;
  const newPipelineValue = hasHubspot ? newDeals * randomBetween(4000, 12000) : 0;
  const wonDeals = hasHubspot ? Math.round((newDeals * randomBetween(10, 25)) / 100) : 0;
  const wonValue = hasHubspot ? wonDeals * randomBetween(4000, 12000) : 0;
  const openDealCount = hasHubspot ? seededDay(dayIndex, 60, 0.3, 0.2) : 0;

  // Win rate / deal velocity reflect a trailing 30-day pool of closed deals,
  // not this single day's (usually tiny, often-zero) new/won deal counts —
  // mirrors the real HubSpot integration's fixed 30-day closed-deals window.
  const trailingClosedWon = hasHubspot ? randomBetween(6, 20) : 0;
  const trailingClosedLost = hasHubspot ? randomBetween(6, 20) : 0;
  const lostDeals = trailingClosedLost;
  const winRate =
    hasHubspot && trailingClosedWon + trailingClosedLost > 0
      ? trailingClosedWon / (trailingClosedWon + trailingClosedLost)
      : null;
  const avgDaysToCloseDays = hasHubspot ? randomBetween(12, 45) : null;

  const scClicks = hasSearchConsole ? seededDay(dayIndex, 220, 1.5, 0.3) : 0;
  const scImpressions = hasSearchConsole ? Math.round(scClicks * randomBetween(12, 22)) : 0;
  const scCtr = hasSearchConsole && scImpressions > 0 ? scClicks / scImpressions : 0;
  const scPosition = hasSearchConsole ? randomBetween(80, 220) / 10 : 0;

  const funnelValues: Record<string, number> = {
    visitor: sessions,
    signup: signups,
    activated: activatedUsers,
    lead: newContacts,
    mql: newMqls,
    demo: demosBooked,
    customer: wonDeals,
  };

  return {
    date,
    companyId: company.id,
    syncedAt: new Date().toISOString(),
    traffic: hasGa4
      ? {
          sessions,
          newUsers,
          activeUsers,
          topChannels: channelBreakdown.map((c) => ({ channel: c.channel, sessions: c.sessions })),
          channelBreakdown,
          topPages: [
            { title: "Home", views: Math.round(sessions * 0.9) },
            { title: "Pricing", views: Math.round(sessions * 0.35) },
            { title: "Blog", views: Math.round(sessions * 0.28) },
            { title: "Sign Up", views: Math.round(sessions * 0.2) },
            { title: "Demo", views: Math.round(sessions * 0.12) },
          ],
        }
      : null,
    trafficSource: hasGa4 ? "ga4" : null,
    signups: hasPosthog
      ? {
          signups,
          activatedUsers,
          activationRate: signups > 0 ? activatedUsers / signups : 0,
          cohortSignups,
          cohortActivated,
          cohortActivationRate,
        }
      : null,
    pipeline: hasHubspot
      ? { newContacts, newMqls, demosBooked, newDeals, newPipelineValue, wonDeals, wonValue, lostDeals, winRate, avgDaysToCloseDays }
      : null,
    searchConsole: hasSearchConsole
      ? {
          clicks: scClicks,
          impressions: scImpressions,
          ctr: scCtr,
          position: scPosition,
          topQueries: [
            { query: "app builder software", clicks: Math.round(scClicks * 0.18) },
            { query: "how to build a mobile app", clicks: Math.round(scClicks * 0.14) },
            { query: `${company.name.toLowerCase()} reviews`, clicks: Math.round(scClicks * 0.1) },
            { query: "no code app maker", clicks: Math.round(scClicks * 0.08) },
            { query: "diy app builder", clicks: Math.round(scClicks * 0.06) },
          ],
        }
      : null,
    googleAds: null, // Ads isn't simulated in sample data; only real syncs populate this
    posthogRevenue: null, // company-specific PostHog revenue event, not simulated in sample data
    attributionFunnel: null, // company-specific PostHog insight, not simulated in sample data
    funnel: buildFunnel(company, funnelValues),
    dealStageFunnel: hasHubspot ? buildDealStageFunnel(openDealCount) : null,
    sourceStatus: [
      ...(hasGa4 ? [{ source: "ga4" as const, connected: true }] : []),
      ...(hasHubspot ? [{ source: "hubspot" as const, connected: true }] : []),
      ...(hasPosthog ? [{ source: "posthog" as const, connected: true }] : []),
      ...(hasSearchConsole ? [{ source: "searchconsole" as const, connected: true }] : []),
    ],
    sample: true,
  };
}

/** Generates `SAMPLE_DAYS` days of sample metrics for a company, oldest first. */
export function generateSampleSeries(company: PortfolioCompany, days = SAMPLE_DAYS): DailyMetrics[] {
  const today = new Date();
  return Array.from({ length: days }, (_, i) => {
    const date = format(subDays(today, days - 1 - i), "yyyy-MM-dd");
    return generateDailyMetrics(company, i, date);
  });
}
