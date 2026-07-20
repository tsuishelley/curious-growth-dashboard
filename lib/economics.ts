import type { PeriodAggregate } from "@/lib/aggregate";
import type { CompanyEconomics, GoalMetric } from "@/lib/config/economics";

// Average Gregorian month length — converts the selected range (in days) into a
// number of "months" so monthly spend/goals scale to whatever window is shown.
const AVG_DAYS_PER_MONTH = 30.437;

export interface UnitEconomics {
  /** Total marketing + sales spend attributed to the period (monthly spend × months in range). */
  periodSpend: number | null;
  /** New customers won in the period — HubSpot won deals, else PostHog paid-conversion count. */
  newCustomers: number | null;
  /** Customer acquisition cost = periodSpend / newCustomers. */
  cac: number | null;
  grossMarginPct: number | null;
  /** Period revenue × gross margin. */
  grossProfit: number | null;
  /** Lifetime value = ARPA × margin × lifetime months. */
  ltv: number | null;
  /** LTV : CAC ratio (rule of thumb: healthy ≥ 3). */
  ltvCacRatio: number | null;
  /** Months to recoup CAC from gross-margin ARPA. */
  paybackMonths: number | null;
  /** Return on marketing + sales spend = (grossProfit − spend) / spend. */
  roi: number | null;
}

/** Which real, connected metric backs each goal (so Goals never invents a number). */
export const GOAL_LABELS: Record<GoalMetric, string> = {
  sessions: "Sessions",
  signups: "Signups",
  newMqls: "New MQLs",
  demosBooked: "Demos booked",
  newPipelineValue: "New pipeline value",
  wonDeals: "Won deals",
  revenue: "Revenue",
};

function actualForMetric(metric: GoalMetric, agg: PeriodAggregate): number | null {
  switch (metric) {
    case "sessions":
      return agg.traffic?.sessions ?? null;
    case "signups":
      return agg.signups?.signups ?? null;
    case "newMqls":
      return agg.pipeline?.newMqls ?? null;
    case "demosBooked":
      return agg.pipeline?.demosBooked ?? null;
    case "newPipelineValue":
      return agg.pipeline?.newPipelineValue ?? null;
    case "wonDeals":
      return agg.pipeline?.wonDeals ?? null;
    case "revenue":
      return agg.posthogRevenue?.amount ?? agg.pipeline?.wonValue ?? null;
  }
}

export function computeUnitEconomics(
  econ: CompanyEconomics,
  agg: PeriodAggregate,
  periodDays: number
): UnitEconomics {
  const months = periodDays / AVG_DAYS_PER_MONTH;

  const hasSpend = econ.monthlyMarketingSpend != null || econ.monthlySalesSpend != null;
  const monthlySpend = (econ.monthlyMarketingSpend ?? 0) + (econ.monthlySalesSpend ?? 0);
  const periodSpend = hasSpend ? monthlySpend * months : null;

  // "New customers" = HubSpot won deals for sales-led companies, else the count
  // of PostHog paid conversions for self-serve ones. Null when neither exists.
  const newCustomers = agg.pipeline?.wonDeals ?? agg.posthogRevenue?.count ?? null;
  const cac = periodSpend != null && newCustomers != null && newCustomers > 0 ? periodSpend / newCustomers : null;

  const grossMarginPct = econ.grossMarginPct ?? null;
  const marginFrac = grossMarginPct != null ? grossMarginPct / 100 : null;

  const periodRevenue = agg.posthogRevenue?.amount ?? agg.pipeline?.wonValue ?? null;
  const grossProfit = periodRevenue != null && marginFrac != null ? periodRevenue * marginFrac : null;

  const marginArpa = econ.arpaMonthly != null && marginFrac != null ? econ.arpaMonthly * marginFrac : null;
  const ltv = marginArpa != null && econ.avgCustomerLifetimeMonths != null ? marginArpa * econ.avgCustomerLifetimeMonths : null;
  const ltvCacRatio = ltv != null && cac != null && cac > 0 ? ltv / cac : null;
  const paybackMonths = cac != null && marginArpa != null && marginArpa > 0 ? cac / marginArpa : null;
  const roi = periodSpend != null && periodSpend > 0 && grossProfit != null ? (grossProfit - periodSpend) / periodSpend : null;

  return { periodSpend, newCustomers, cac, grossMarginPct, grossProfit, ltv, ltvCacRatio, paybackMonths, roi };
}

export interface GoalProgress {
  metric: GoalMetric;
  label: string;
  actual: number;
  /** Target scaled from the monthly goal to the selected range. */
  target: number;
  /** actual / target (1 = on target). */
  attainment: number;
}

export function computeGoals(econ: CompanyEconomics, agg: PeriodAggregate, periodDays: number): GoalProgress[] {
  if (!econ.goals) return [];
  const months = periodDays / AVG_DAYS_PER_MONTH;

  const progress: GoalProgress[] = [];
  for (const [metric, monthlyTarget] of Object.entries(econ.goals) as [GoalMetric, number][]) {
    if (monthlyTarget == null) continue;
    const actual = actualForMetric(metric, agg);
    if (actual == null) continue; // no connected data backs this metric yet — don't show an empty goal
    const target = monthlyTarget * months;
    progress.push({
      metric,
      label: GOAL_LABELS[metric],
      actual,
      target,
      attainment: target > 0 ? actual / target : 0,
    });
  }
  return progress;
}
