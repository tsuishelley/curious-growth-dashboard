"use client";

import { useMemo, useState } from "react";
import type { PortfolioCompany } from "@/lib/config/portfolio";
import type { DailyMetrics, WeeklyInsight } from "@/lib/types";
import { aggregatePeriod, comparableCoverage, weekOverWeekChange } from "@/lib/aggregate";
import WeeklyInsights from "@/components/WeeklyInsights";
import KpiCard from "@/components/KpiCard";
import TrendChart from "@/components/TrendChart";
import MonthlyBarChart from "@/components/MonthlyBarChart";
import FunnelChart from "@/components/FunnelChart";
import TopListCard from "@/components/TopListCard";
import AttributionFunnel from "@/components/AttributionFunnel";
import UnitEconomics from "@/components/UnitEconomics";
import GoalsCard from "@/components/GoalsCard";
import ChannelBreakdownTable from "@/components/ChannelBreakdownTable";
import { getCompanyEconomics } from "@/lib/config/economics";
import { computeUnitEconomics, computeGoals } from "@/lib/economics";

type RangeKey = "30d" | "90d" | "ytd";
type TabKey = "overview" | "funnel" | "traffic" | "product" | "sales" | "seo" | "paid";

const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: "30d", label: "Last 30 Days" },
  { key: "90d", label: "Last 90 Days" },
  { key: "ytd", label: "YTD" },
];

/** Splits `metrics` into the selected current period and its directly-prior comparison period. YTD has no prior period -- comparing to "YTD a year ago" isn't reliable with how little real history is backfilled yet. */
function splitPeriods(metrics: DailyMetrics[], range: RangeKey): { currentPeriod: DailyMetrics[]; previousPeriod: DailyMetrics[]; rangeLabel: string } {
  if (range === "30d") {
    return { currentPeriod: metrics.slice(-30), previousPeriod: metrics.slice(-60, -30), rangeLabel: "30d" };
  }
  if (range === "90d") {
    return { currentPeriod: metrics.slice(-90), previousPeriod: metrics.slice(-180, -90), rangeLabel: "90d" };
  }
  const year = new Date().getFullYear();
  return {
    currentPeriod: metrics.filter((m) => m.date.startsWith(`${year}-`)),
    previousPeriod: [],
    rangeLabel: "YTD",
  };
}

export default function CompanyMetricsView({
  company,
  metrics,
  insight,
}: {
  company: PortfolioCompany;
  metrics: DailyMetrics[];
  insight?: WeeklyInsight | null;
}) {
  const [range, setRange] = useState<RangeKey>("30d");
  const [tab, setTab] = useState<TabKey>("overview");
  // Hooks must run unconditionally on every render, so this is computed before
  // the early "no data at all" return below (splitPeriods handles an empty
  // `metrics` array fine, just returning empty slices).
  const { currentPeriod, previousPeriod, rangeLabel } = useMemo(() => splitPeriods(metrics, range), [metrics, range]);

  if (metrics.length === 0) {
    return (
      <div className="border border-dashed border-rule bg-paper p-12 text-center">
        <h2 className="font-display text-xl text-ink">No data yet for {company.name}</h2>
        <p className="mx-auto mt-3 max-w-md text-[14px] leading-relaxed text-ink-muted">
          Add {company.name}&apos;s GA4 / HubSpot / PostHog credentials to your environment, then the daily
          sync will start populating real metrics here.
        </p>
      </div>
    );
  }

  const rangeSelector = (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h2 className="font-display text-2xl leading-none text-ink">{company.name}</h2>
        <p className="mt-2 text-[12px] text-ink-faint">
          Last synced {new Date(metrics[metrics.length - 1].syncedAt).toLocaleString()}
          {metrics[metrics.length - 1].sample && (
            <span className="label-mono ml-2 bg-accent-soft px-1.5 py-0.5 text-accent">sample data</span>
          )}
        </p>
      </div>
      <div className="flex border border-rule bg-paper">
        {RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => setRange(opt.key)}
            className={`label-mono px-4 py-2.5 transition-colors ${
              range === opt.key ? "bg-canvas font-medium text-ink" : "text-ink-faint hover:text-ink"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );

  if (currentPeriod.length === 0) {
    return (
      <div className="space-y-6">
        {rangeSelector}
        <div className="border border-dashed border-rule bg-paper p-10 text-center">
          <p className="text-[14px] text-ink-muted">No synced data falls within {rangeLabel} yet.</p>
        </div>
      </div>
    );
  }

  const latestDay = currentPeriod[currentPeriod.length - 1];
  const previousLatestDay = previousPeriod[previousPeriod.length - 1] as DailyMetrics | undefined;

  // Activation rate is a real cohort conversion computed over a rolling 30-day
  // window (see SignupMetrics.cohortActivationRate), so — like win rate — it's
  // read from the latest snapshot rather than summed across the selected range.
  // Falls back to the legacy same-window ratio only for snapshots synced before
  // the cohort field existed, so the card always renders something.
  const cohortActivationRate = latestDay.signups?.cohortActivationRate;
  const prevCohortActivationRate = previousLatestDay?.signups?.cohortActivationRate;

  // Each day's attribution funnel already covers a trailing 30-day window, so the
  // snapshot from ~30 days before the latest one is the directly-prior,
  // non-overlapping period to compare against. Look back through the full fetched
  // history (not just the selected range) for the newest snapshot on/before that
  // cutoff that actually carries an attribution funnel.
  const priorAttributionSteps = (() => {
    if (!latestDay.attributionFunnel) return undefined;
    const cutoff = new Date(latestDay.date);
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    for (let i = metrics.length - 1; i >= 0; i--) {
      const af = metrics[i].attributionFunnel;
      if (metrics[i].date <= cutoffStr && af && af.steps.length > 0) return af.steps;
    }
    return undefined;
  })();

  const current = aggregatePeriod(currentPeriod);
  const previous = aggregatePeriod(previousPeriod);
  const changeLabel = `vs prior ${rangeLabel}`;

  // Nominal calendar length of the selected range, used to scale monthly spend
  // and goals (which accrue over calendar time, independent of how many days
  // actually have synced data). 30d/90d are fixed; YTD is days elapsed this year.
  const rangeDays =
    range === "30d"
      ? 30
      : range === "90d"
        ? 90
        : Math.max(1, Math.ceil((Date.now() - new Date(new Date().getFullYear(), 0, 1).getTime()) / 86_400_000));
  const economics = getCompanyEconomics(company.id);
  const unitEconomics = computeUnitEconomics(economics, current, rangeDays);
  const goals = computeGoals(economics, current, rangeDays);
  // GA4 if connected, else PostHog's own pageview/session data as a fallback
  // (see trackWebsiteTraffic) -- reflects whichever source actually supplied
  // `current.traffic`, so the "Source: X" label is never wrong.
  const trafficSource = latestDay.trafficSource ?? "ga4";

  // Only show a % change when the prior period has comparable day-coverage for
  // that source -- otherwise (e.g. HubSpot backfilled only ~30 real days, or YTD
  // having no prior period at all) the comparison would be nonsense. `null` hides it.
  const trafficComparable = comparableCoverage(current.coverage.traffic, previous.coverage.traffic);
  const signupsComparable = comparableCoverage(current.coverage.signups, previous.coverage.signups);
  const pipelineComparable = comparableCoverage(current.coverage.pipeline, previous.coverage.pipeline);
  const searchComparable = comparableCoverage(current.coverage.searchConsole, previous.coverage.searchConsole);
  const googleAdsComparable = comparableCoverage(current.coverage.googleAds, previous.coverage.googleAds);
  const revenueComparable = comparableCoverage(current.coverage.posthogRevenue, previous.coverage.posthogRevenue);

  const sessionsTrend = currentPeriod.map((m) => ({ date: m.date, value: m.traffic?.sessions ?? 0 }));
  const signupsTrend = currentPeriod.map((m) => ({ date: m.date, value: m.signups?.signups ?? 0 }));
  const pipelineTrend = currentPeriod.map((m) => ({ date: m.date, value: m.pipeline?.newPipelineValue ?? 0 }));
  const searchClicksTrend = currentPeriod.map((m) => ({ date: m.date, value: m.searchConsole?.clicks ?? 0 }));
  const adSpendTrend = currentPeriod.map((m) => ({ date: m.date, value: m.googleAds?.cost ?? 0 }));
  const revenueTrend = currentPeriod.map((m) => ({ date: m.date, value: m.posthogRevenue?.amount ?? 0 }));
  // Swap "ga4" for the actual traffic source (see `trafficSource` above) so
  // the funnel's own "Source: X" footer stays accurate too.
  const funnelSources = Array.from(new Set(company.funnel.map((s) => (s.source === "ga4" ? trafficSource : s.source))));

  // If real synced data actually starts later than the selected range's
  // nominal beginning (e.g. a company's PostHog revenue tracking only goes
  // back a few months), a "YTD" or "90d" total can look wrong even though
  // it's mathematically correct -- it's just quietly a shorter window than
  // the label implies. Surface the real start date so that's obvious.
  const earliestRealDate = metrics.length > 0 ? metrics[0].date : null;
  const nominalStartDate = (() => {
    const today = new Date();
    if (range === "30d") {
      const d = new Date(today);
      d.setDate(d.getDate() - 29);
      return d.toISOString().slice(0, 10);
    }
    if (range === "90d") {
      const d = new Date(today);
      d.setDate(d.getDate() - 89);
      return d.toISOString().slice(0, 10);
    }
    return `${today.getFullYear()}-01-01`;
  })();
  const dataStartsLate = earliestRealDate !== null && earliestRealDate > nominalStartDate;

  // Tabs are shown only for the data a company actually has, so an empty source
  // never renders a dead tab. Overview is always present.
  const availableTabs: { key: TabKey; label: string }[] = [
    { key: "overview", label: "Overview" },
    ...(current.funnel.length > 0 ? [{ key: "funnel" as const, label: "Funnel" }] : []),
    ...(current.traffic ? [{ key: "traffic" as const, label: "Traffic" }] : []),
    ...(current.signups || current.posthogRevenue ? [{ key: "product" as const, label: "Product" }] : []),
    ...(current.pipeline ? [{ key: "sales" as const, label: "Sales" }] : []),
    ...(current.searchConsole ? [{ key: "seo" as const, label: "SEO" }] : []),
    ...(current.googleAds ? [{ key: "paid" as const, label: "Paid" }] : []),
  ];
  const activeTab: TabKey = availableTabs.some((t) => t.key === tab) ? tab : "overview";

  return (
    <div className="space-y-6">
      {rangeSelector}

      <div className="flex flex-wrap gap-1 border-b border-rule">
        {availableTabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`label-mono -mb-px border-b-2 px-4 py-2.5 transition-colors ${
              activeTab === t.key ? "border-accent text-ink" : "border-transparent text-ink-faint hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <p className="text-[12px] leading-relaxed text-ink-faint">
        Totals reflect real synced data only, never fabricated — a source with less history than{" "}
        {rangeLabel} shows a partial total for that period rather than an inflated or zeroed-out one.
      </p>
      {dataStartsLate && (
        <p className="border-l-2 border-accent pl-3 text-[12px] leading-relaxed text-accent">
          Note: the earliest real synced data for {company.name} is {earliestRealDate} — {rangeLabel} totals only
          cover that shorter window, not the full {rangeLabel} period.
        </p>
      )}

      {/* ---------------- OVERVIEW: AI insight + leading/lagging scorecard + goals + unit economics ---------------- */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {insight && <WeeklyInsights insight={insight} />}

          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h3 className="font-display text-lg text-ink">Leading indicators</h3>
              <span className="label-mono text-ink-faint">top of funnel · {rangeLabel}</span>
            </div>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {current.traffic && (
                <KpiCard
                  label={`Sessions (${rangeLabel})`}
                  value={current.traffic.sessions.toLocaleString()}
                  changeFraction={trafficComparable && previous.traffic ? weekOverWeekChange(current.traffic.sessions, previous.traffic.sessions) : null}
                  changeLabel={changeLabel}
                  source={trafficSource}
                />
              )}
              {current.signups && (
                <KpiCard
                  label={`Signups (${rangeLabel})`}
                  value={current.signups.signups.toLocaleString()}
                  changeFraction={signupsComparable && previous.signups ? weekOverWeekChange(current.signups.signups, previous.signups.signups) : null}
                  changeLabel={changeLabel}
                  source="posthog"
                />
              )}
              {current.pipeline && (
                <KpiCard
                  label={`New MQLs (${rangeLabel})`}
                  value={current.pipeline.newMqls.toLocaleString()}
                  changeFraction={pipelineComparable && previous.pipeline ? weekOverWeekChange(current.pipeline.newMqls, previous.pipeline.newMqls) : null}
                  changeLabel={changeLabel}
                  source="hubspot"
                />
              )}
              {current.pipeline?.demosBooked != null && (
                <KpiCard
                  label={`Demos Booked (${rangeLabel})`}
                  value={current.pipeline.demosBooked.toLocaleString()}
                  changeFraction={pipelineComparable && previous.pipeline?.demosBooked != null ? weekOverWeekChange(current.pipeline.demosBooked, previous.pipeline.demosBooked) : null}
                  changeLabel={changeLabel}
                  source="hubspot"
                />
              )}
              {current.searchConsole && !current.pipeline && (
                <KpiCard
                  label={`Search Clicks (${rangeLabel})`}
                  value={current.searchConsole.clicks.toLocaleString()}
                  changeFraction={searchComparable && previous.searchConsole ? weekOverWeekChange(current.searchConsole.clicks, previous.searchConsole.clicks) : null}
                  changeLabel={changeLabel}
                  source="searchconsole"
                />
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h3 className="font-display text-lg text-ink">Lagging indicators</h3>
              <span className="label-mono text-ink-faint">outcomes · {rangeLabel}</span>
            </div>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {current.posthogRevenue && (
                <KpiCard
                  label={`New Revenue (${rangeLabel})`}
                  value={`$${current.posthogRevenue.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                  changeFraction={revenueComparable && previous.posthogRevenue ? weekOverWeekChange(current.posthogRevenue.amount, previous.posthogRevenue.amount) : null}
                  changeLabel={changeLabel}
                  source="posthog"
                />
              )}
              {current.pipeline && (
                <KpiCard
                  label={`New Pipeline (${rangeLabel})`}
                  value={`$${current.pipeline.newPipelineValue.toLocaleString()}`}
                  changeFraction={pipelineComparable && previous.pipeline ? weekOverWeekChange(current.pipeline.newPipelineValue, previous.pipeline.newPipelineValue) : null}
                  changeLabel={changeLabel}
                  source="hubspot"
                />
              )}
              {latestDay.pipeline?.winRate != null && (
                <KpiCard
                  label="Win Rate (current)"
                  value={`${(latestDay.pipeline.winRate * 100).toFixed(0)}%`}
                  changeFraction={pipelineComparable && previousLatestDay?.pipeline?.winRate != null ? weekOverWeekChange(latestDay.pipeline.winRate, previousLatestDay.pipeline.winRate) : null}
                  changeLabel={`vs ${rangeLabel} ago`}
                  source="hubspot"
                  hint="Won ÷ (won + lost) among deals marked closed in HubSpot over the trailing 30 days. Only counts deals actually logged and closed in the CRM, so it reflects HubSpot hygiene and can read higher than reality if reps don't log every deal."
                />
              )}
              {current.signups && (
                <KpiCard
                  label="Activation Rate (30d cohort)"
                  value={`${((cohortActivationRate ?? current.signups.activationRate) * 100).toFixed(1)}%`}
                  changeFraction={cohortActivationRate != null && prevCohortActivationRate != null ? weekOverWeekChange(cohortActivationRate, prevCohortActivationRate) : null}
                  changeLabel={`vs ${rangeLabel} ago`}
                  source="posthog"
                  hint="Of the distinct users who signed up in the last 30 days, the share who have since hit the activation milestone. A cohort conversion, so it stays between 0–100%."
                />
              )}
            </div>
          </div>

          {/* Both render null until a company's economics/goals are filled in
              (lib/config/economics.ts), so they stay hidden rather than showing
              fabricated numbers. */}
          <GoalsCard goals={goals} rangeLabel={rangeLabel} />
          <UnitEconomics data={unitEconomics} rangeLabel={rangeLabel} />
        </div>
      )}

      {/* ---------------- FUNNEL ---------------- */}
      {activeTab === "funnel" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <FunnelChart stages={current.funnel} source={funnelSources} />
          {latestDay.dealStageFunnel && latestDay.dealStageFunnel.length > 0 && (
            <FunnelChart
              title="HubSpot Deal Pipeline (open deals)"
              stages={latestDay.dealStageFunnel}
              source="hubspot"
              mode="snapshot"
            />
          )}
          {latestDay.attributionFunnel && latestDay.attributionFunnel.byChannel.length > 0 && (
            <div className="lg:col-span-2">
              <AttributionFunnel
                title={`${latestDay.attributionFunnel.insightName} (30d)`}
                steps={latestDay.attributionFunnel.steps}
                byChannel={latestDay.attributionFunnel.byChannel}
                previousSteps={priorAttributionSteps}
                caveat="This funnel only counts people PostHog can link across your marketing site and app as the same person. If your site and app don't share identity (e.g. no identify/alias call linking an anonymous marketing-site visit to the later signed-in user), most real conversions won't be counted here even though they happened — treat these as a lower bound, not the true conversion rate. Its counts also won't tie out to the Total Signups card or the Funnel box: those tally raw sign-up events, while this counts unique identity-linked people through a saved PostHog funnel — a different measure, not a discrepancy."
              />
            </div>
          )}
        </div>
      )}

      {/* ---------------- TRAFFIC ---------------- */}
      {activeTab === "traffic" && current.traffic && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <KpiCard
              label={`Total Sessions (${rangeLabel})`}
              value={current.traffic.sessions.toLocaleString()}
              changeFraction={trafficComparable && previous.traffic ? weekOverWeekChange(current.traffic.sessions, previous.traffic.sessions) : null}
              changeLabel={changeLabel}
              source={trafficSource}
            />
            <KpiCard
              label={`New Users (${rangeLabel})`}
              value={current.traffic.newUsers.toLocaleString()}
              changeFraction={trafficComparable && previous.traffic ? weekOverWeekChange(current.traffic.newUsers, previous.traffic.newUsers) : null}
              changeLabel={changeLabel}
              source={trafficSource}
            />
            <KpiCard
              label={`Active Users (${rangeLabel})`}
              value={current.traffic.activeUsers.toLocaleString()}
              changeFraction={trafficComparable && previous.traffic ? weekOverWeekChange(current.traffic.activeUsers, previous.traffic.activeUsers) : null}
              changeLabel={changeLabel}
              source={trafficSource}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <TrendChart
              title={`Sessions (${rangeLabel})`}
              data={sessionsTrend}
              source="ga4"
              periodTotal={current.traffic.sessions.toLocaleString()}
            />
            {current.traffic.topPages && current.traffic.topPages.length > 0 && (
              <TopListCard
                title={`Top Pages by Views (${rangeLabel})`}
                items={current.traffic.topPages.map((p) => ({ label: p.title, value: p.views }))}
                source={trafficSource}
              />
            )}
            {current.traffic.channelBreakdown && current.traffic.channelBreakdown.length > 0 ? (
              <div className="lg:col-span-2">
                <ChannelBreakdownTable channels={current.traffic.channelBreakdown} rangeLabel={rangeLabel} />
              </div>
            ) : (
              current.traffic.topChannels &&
              current.traffic.topChannels.length > 0 && (
                <TopListCard
                  title={`Sessions by Channel (${rangeLabel})`}
                  items={current.traffic.topChannels.map((c) => ({ label: c.channel, value: c.sessions }))}
                  source={trafficSource}
                />
              )
            )}
          </div>
        </div>
      )}

      {/* ---------------- PRODUCT (self-serve signups / revenue) ---------------- */}
      {activeTab === "product" && (current.signups || current.posthogRevenue) && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {current.signups && (
              <>
                <KpiCard
                  label={`Total Signups (${rangeLabel})`}
                  value={current.signups.signups.toLocaleString()}
                  changeFraction={signupsComparable && previous.signups ? weekOverWeekChange(current.signups.signups, previous.signups.signups) : null}
                  changeLabel={changeLabel}
                  source="posthog"
                  hint={`Total count of sign-up events over the ${rangeLabel} window, summed from the daily syncs — the same number the Signups chart and the Funnel use. The attribution funnel counts something different (unique, identity-linked people through a saved PostHog funnel), so its signup figure won't match this one.`}
                />
                <KpiCard
                  label="Activation Rate (30d cohort)"
                  value={`${((cohortActivationRate ?? current.signups.activationRate) * 100).toFixed(1)}%`}
                  changeFraction={cohortActivationRate != null && prevCohortActivationRate != null ? weekOverWeekChange(cohortActivationRate, prevCohortActivationRate) : null}
                  changeLabel={`vs ${rangeLabel} ago`}
                  source="posthog"
                  hint="Of the distinct users who signed up in the last 30 days, the share who have since hit the activation milestone. A cohort conversion, so it stays between 0–100% — unlike a raw activations-per-signup ratio."
                />
              </>
            )}
            {current.posthogRevenue && (
              <KpiCard
                label={`Total New Revenue (${rangeLabel})`}
                value={`$${current.posthogRevenue.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                changeFraction={revenueComparable && previous.posthogRevenue ? weekOverWeekChange(current.posthogRevenue.amount, previous.posthogRevenue.amount) : null}
                changeLabel={changeLabel}
                source="posthog"
              />
            )}
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {current.signups && (
              <TrendChart
                title={`Signups (${rangeLabel})`}
                data={signupsTrend}
                source="posthog"
                periodTotal={current.signups.signups.toLocaleString()}
              />
            )}
            {current.posthogRevenue && (
              <MonthlyBarChart
                title={`New revenue by month (${rangeLabel})`}
                data={revenueTrend}
                source="posthog"
                valueFormatter={(v) => (v >= 1000 ? `$${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : `$${v.toLocaleString()}`)}
              />
            )}
          </div>
        </div>
      )}

      {/* ---------------- SALES (HubSpot pipeline) ---------------- */}
      {activeTab === "sales" && current.pipeline && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <KpiCard
              label={`New Leads (${rangeLabel})`}
              value={current.pipeline.newContacts.toLocaleString()}
              changeFraction={pipelineComparable && previous.pipeline ? weekOverWeekChange(current.pipeline.newContacts, previous.pipeline.newContacts) : null}
              changeLabel={changeLabel}
              source="hubspot"
            />
            <KpiCard
              label={`Total New MQLs (${rangeLabel})`}
              value={current.pipeline.newMqls.toLocaleString()}
              changeFraction={pipelineComparable && previous.pipeline ? weekOverWeekChange(current.pipeline.newMqls, previous.pipeline.newMqls) : null}
              changeLabel={changeLabel}
              source="hubspot"
            />
            {current.pipeline.demosBooked != null && (
              <KpiCard
                label={`Demos Booked (${rangeLabel})`}
                value={current.pipeline.demosBooked.toLocaleString()}
                changeFraction={pipelineComparable && previous.pipeline?.demosBooked != null ? weekOverWeekChange(current.pipeline.demosBooked, previous.pipeline.demosBooked) : null}
                changeLabel={changeLabel}
                source="hubspot"
                hint="Meeting engagements booked (created) in HubSpot during the period — the bridge from MQL to a sales conversation. Only counts meetings actually logged in HubSpot, so it reflects CRM hygiene and can read low if reps don't log every call."
              />
            )}
            <KpiCard
              label={`Total New Pipeline (${rangeLabel})`}
              value={`$${current.pipeline.newPipelineValue.toLocaleString()}`}
              changeFraction={pipelineComparable && previous.pipeline ? weekOverWeekChange(current.pipeline.newPipelineValue, previous.pipeline.newPipelineValue) : null}
              changeLabel={changeLabel}
              source="hubspot"
            />
            {latestDay.pipeline?.winRate != null && (
              <KpiCard
                label="Win Rate (current)"
                value={`${(latestDay.pipeline.winRate * 100).toFixed(0)}%`}
                changeFraction={pipelineComparable && previousLatestDay?.pipeline?.winRate != null ? weekOverWeekChange(latestDay.pipeline.winRate, previousLatestDay.pipeline.winRate) : null}
                changeLabel={`vs ${rangeLabel} ago`}
                source="hubspot"
                hint="Won ÷ (won + lost) among deals marked closed in HubSpot over the trailing 30 days. It only counts deals actually logged and closed in the CRM, so it reflects HubSpot hygiene — conversations or deals reps never logged aren't counted and can make this read higher than reality."
              />
            )}
            {latestDay.pipeline?.avgDaysToCloseDays != null && (
              <KpiCard
                label="Avg Days to Close (current)"
                value={`${latestDay.pipeline.avgDaysToCloseDays.toFixed(0)}d`}
                source="hubspot"
              />
            )}
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <TrendChart
              title={`New pipeline value (${rangeLabel})`}
              data={pipelineTrend}
              source="hubspot"
              periodTotal={`$${current.pipeline.newPipelineValue.toLocaleString()}`}
            />
            {latestDay.dealStageFunnel && latestDay.dealStageFunnel.length > 0 && (
              <FunnelChart
                title="HubSpot Deal Pipeline (open deals)"
                stages={latestDay.dealStageFunnel}
                source="hubspot"
                mode="snapshot"
              />
            )}
          </div>
        </div>
      )}

      {/* ---------------- SEO (Search Console) ---------------- */}
      {activeTab === "seo" && current.searchConsole && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <KpiCard
              label={`Total Search Clicks (${rangeLabel})`}
              value={current.searchConsole.clicks.toLocaleString()}
              changeFraction={searchComparable && previous.searchConsole ? weekOverWeekChange(current.searchConsole.clicks, previous.searchConsole.clicks) : null}
              changeLabel={changeLabel}
              source="searchconsole"
            />
            <KpiCard
              label={`Total Search Impressions (${rangeLabel})`}
              value={current.searchConsole.impressions.toLocaleString()}
              changeFraction={searchComparable && previous.searchConsole ? weekOverWeekChange(current.searchConsole.impressions, previous.searchConsole.impressions) : null}
              changeLabel={changeLabel}
              source="searchconsole"
            />
            <KpiCard
              label={`Avg Search Position (${rangeLabel})`}
              value={current.searchConsole.position.toFixed(1)}
              changeFraction={(() => {
                if (!searchComparable || !previous.searchConsole) return null;
                const raw = weekOverWeekChange(current.searchConsole.position, previous.searchConsole.position);
                return raw === null ? null : -raw;
              })()}
              changeLabel={changeLabel}
              source="searchconsole"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <TrendChart
              title={`Search clicks (${rangeLabel})`}
              data={searchClicksTrend}
              source="searchconsole"
              periodTotal={current.searchConsole.clicks.toLocaleString()}
            />
            {current.searchConsole.topQueries && current.searchConsole.topQueries.length > 0 && (
              <TopListCard
                title={`Top Search Queries (${rangeLabel})`}
                items={current.searchConsole.topQueries.map((q) => ({ label: q.query, value: q.clicks }))}
                source="searchconsole"
              />
            )}
          </div>
        </div>
      )}

      {/* ---------------- PAID (Google Ads) ---------------- */}
      {activeTab === "paid" && current.googleAds && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <KpiCard
              label={`Total Ad Spend (${rangeLabel})`}
              value={`$${current.googleAds.cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
              changeFraction={googleAdsComparable && previous.googleAds ? weekOverWeekChange(current.googleAds.cost, previous.googleAds.cost) : null}
              changeLabel={changeLabel}
              source="googleads"
            />
            <KpiCard
              label={`Total Ad Clicks (${rangeLabel})`}
              value={current.googleAds.clicks.toLocaleString()}
              changeFraction={googleAdsComparable && previous.googleAds ? weekOverWeekChange(current.googleAds.clicks, previous.googleAds.clicks) : null}
              changeLabel={changeLabel}
              source="googleads"
            />
            <KpiCard
              label={`Total Ad Conversions (${rangeLabel})`}
              value={current.googleAds.conversions.toLocaleString(undefined, { maximumFractionDigits: 1 })}
              changeFraction={googleAdsComparable && previous.googleAds ? weekOverWeekChange(current.googleAds.conversions, previous.googleAds.conversions) : null}
              changeLabel={changeLabel}
              source="googleads"
            />
            <KpiCard
              label={`Avg CPC (${rangeLabel})`}
              value={`$${current.googleAds.cpc.toFixed(2)}`}
              changeFraction={googleAdsComparable && previous.googleAds ? weekOverWeekChange(current.googleAds.cpc, previous.googleAds.cpc) : null}
              changeLabel={changeLabel}
              source="googleads"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <TrendChart
              title={`Ad spend (${rangeLabel})`}
              data={adSpendTrend}
              source="googleads"
              periodTotal={`$${current.googleAds.cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
            />
            {current.googleAds.topCampaigns && current.googleAds.topCampaigns.length > 0 && (
              <TopListCard
                title={`Top Ad Campaigns by Spend (${rangeLabel})`}
                items={current.googleAds.topCampaigns.map((c) => ({ label: c.name, value: c.cost }))}
                source="googleads"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
