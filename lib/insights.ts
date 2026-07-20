import Anthropic from "@anthropic-ai/sdk";
import { format } from "date-fns";
import { adminDb } from "@/lib/firebase/admin";
import { aggregatePeriod } from "@/lib/aggregate";
import type { DailyMetrics, WeeklyInsight } from "@/lib/types";
import type { PortfolioCompany } from "@/lib/config/portfolio";

const INSIGHTS_MODEL = "claude-sonnet-5";

/** ISO week identifier, e.g. "2026-W27". */
export function currentWeekId(date = new Date()): string {
  return format(date, "RRRR-'W'II");
}

/** Builds a compact this-week-vs-prior-week numeric summary to feed the model. */
function buildComparison(metrics: DailyMetrics[]) {
  const thisWeek = aggregatePeriod(metrics.slice(-7));
  const priorWeek = aggregatePeriod(metrics.slice(-14, -7));
  const latest = metrics[metrics.length - 1];

  const pct = (cur?: number, prev?: number) =>
    prev && prev !== 0 && cur != null ? Number((((cur - prev) / prev) * 100).toFixed(1)) : null;

  return {
    traffic: thisWeek.traffic && {
      sessions: thisWeek.traffic.sessions,
      sessionsWoWPct: pct(thisWeek.traffic.sessions, priorWeek.traffic?.sessions),
      newUsers: thisWeek.traffic.newUsers,
      topChannels: thisWeek.traffic.topChannels.slice(0, 5),
    },
    signups: thisWeek.signups && {
      signups: thisWeek.signups.signups,
      signupsWoWPct: pct(thisWeek.signups.signups, priorWeek.signups?.signups),
      activationRate: Number((thisWeek.signups.activationRate * 100).toFixed(1)),
    },
    pipeline: thisWeek.pipeline && {
      newContacts: thisWeek.pipeline.newContacts,
      newMqls: thisWeek.pipeline.newMqls,
      newMqlsWoWPct: pct(thisWeek.pipeline.newMqls, priorWeek.pipeline?.newMqls),
      demosBooked: thisWeek.pipeline.demosBooked,
      demosBookedWoWPct: pct(thisWeek.pipeline.demosBooked, priorWeek.pipeline?.demosBooked),
      newDeals: thisWeek.pipeline.newDeals,
      newPipelineValue: thisWeek.pipeline.newPipelineValue,
      newPipelineWoWPct: pct(thisWeek.pipeline.newPipelineValue, priorWeek.pipeline?.newPipelineValue),
      wonDeals: thisWeek.pipeline.wonDeals,
      winRate: latest.pipeline?.winRate != null ? Number((latest.pipeline.winRate * 100).toFixed(0)) : null,
      avgDaysToClose: latest.pipeline?.avgDaysToCloseDays ?? null,
    },
    searchConsole: thisWeek.searchConsole && {
      clicks: thisWeek.searchConsole.clicks,
      clicksWoWPct: pct(thisWeek.searchConsole.clicks, priorWeek.searchConsole?.clicks),
      impressions: thisWeek.searchConsole.impressions,
      avgPosition: Number(thisWeek.searchConsole.position.toFixed(1)),
      topQueries: thisWeek.searchConsole.topQueries.slice(0, 5),
    },
    googleAds: thisWeek.googleAds && {
      cost: thisWeek.googleAds.cost,
      costWoWPct: pct(thisWeek.googleAds.cost, priorWeek.googleAds?.cost),
      clicks: thisWeek.googleAds.clicks,
      conversions: thisWeek.googleAds.conversions,
      conversionsWoWPct: pct(thisWeek.googleAds.conversions, priorWeek.googleAds?.conversions),
      cpc: Number(thisWeek.googleAds.cpc.toFixed(2)),
    },
    posthogRevenue: thisWeek.posthogRevenue && {
      amount: thisWeek.posthogRevenue.amount,
      amountWoWPct: pct(thisWeek.posthogRevenue.amount, priorWeek.posthogRevenue?.amount),
      count: thisWeek.posthogRevenue.count,
    },
    funnel: thisWeek.funnel,
  };
}

/** Calls Claude to produce a short markdown insight summary. Returns null if no API key. */
export async function generateWeeklyInsight(
  company: PortfolioCompany,
  metrics: DailyMetrics[]
): Promise<WeeklyInsight | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (metrics.length === 0) return null;

  const client = new Anthropic();
  const comparison = buildComparison(metrics);

  const response = await client.messages.create({
    model: INSIGHTS_MODEL,
    max_tokens: 2000,
    thinking: { type: "adaptive" },
    output_config: { effort: "low" },
    system:
      "You are a growth analyst for the VC firm Curious, writing a weekly read on a portfolio company's " +
      "leading indicators of growth. You will receive this-week-vs-prior-week metrics as JSON (traffic from " +
      "GA4, signups/activation from PostHog, pipeline from HubSpot, organic search from Search Console, paid " +
      "acquisition from Google Ads, real revenue from PostHog (for self-serve companies with no HubSpot " +
      "pipeline), and an end-to-end funnel). Write 3-5 tight markdown bullet points. Lead with " +
      "the most important movement. Cite " +
      "specific numbers and week-over-week percentages. Call out genuine concerns (sharp drops, funnel leaks, " +
      "stalled stages) and genuine bright spots. Do not invent data not present in the JSON; if a source is " +
      "absent, don't mention it. No preamble, no header, no closing summary — only the bullet points.",
    messages: [
      {
        role: "user",
        content: `Company: ${company.name}\n\nMetrics (this week vs prior week):\n${JSON.stringify(
          comparison,
          null,
          2
        )}`,
      },
    ],
  });

  const summary = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  if (!summary) return null;

  return {
    weekId: currentWeekId(),
    companyId: company.id,
    generatedAt: new Date().toISOString(),
    summary,
    model: INSIGHTS_MODEL,
  };
}

/** Generates the current week's insight (if not already present) and stores it in Firestore. */
export async function generateAndStoreWeeklyInsight(
  company: PortfolioCompany,
  metrics: DailyMetrics[],
  force = false
): Promise<WeeklyInsight | null> {
  const weekId = currentWeekId();
  const ref = adminDb().collection("companies").doc(company.id).collection("weeklyInsights").doc(weekId);

  if (!force) {
    const existing = await ref.get();
    if (existing.exists) return existing.data() as WeeklyInsight;
  }

  const insight = await generateWeeklyInsight(company, metrics);
  if (!insight) return null;

  await ref.set(insight);
  return insight;
}

/** Reads the most recent stored weekly insight for a company (no generation). */
export async function getLatestInsight(companyId: string): Promise<WeeklyInsight | null> {
  const snap = await adminDb()
    .collection("companies")
    .doc(companyId)
    .collection("weeklyInsights")
    .orderBy("weekId", "desc")
    .limit(1)
    .get();
  return snap.empty ? null : (snap.docs[0].data() as WeeklyInsight);
}
