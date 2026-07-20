/**
 * Per-company cost + goal inputs for the Unit Economics and Goals views.
 *
 * None of this is derivable from a connected data source — spend on FTEs /
 * contractors / software, gross margin, LTV assumptions, and targets all live in
 * people's heads and spreadsheets, so they're entered here by hand. Keeping the
 * dashboard's "never fabricate" contract: every field is optional and a card
 * only renders once its inputs exist, so an empty entry simply hides those views
 * rather than showing a made-up zero.
 *
 * Spend and goals are expressed PER 30-DAY MONTH; the dashboard scales them to
 * the selected range (30d ≈ 1×, 90d ≈ 3×, YTD ≈ months elapsed) so a monthly
 * budget compares correctly against whatever window is on screen.
 */
export type GoalMetric =
  | "sessions"
  | "signups"
  | "newMqls"
  | "demosBooked"
  | "newPipelineValue"
  | "wonDeals"
  | "revenue";

export interface CompanyEconomics {
  /** Marketing spend per 30 days: paid media + software + marketing FTE/contractor allocation. */
  monthlyMarketingSpend?: number;
  /** Sales spend per 30 days: sales FTE/contractor cost. */
  monthlySalesSpend?: number;
  /** Blended gross margin as a percentage, 0–100 (e.g. 80 for an 80%-margin SaaS). */
  grossMarginPct?: number;
  /** Average recurring revenue per account per 30 days (ARPA) — drives LTV + payback. */
  arpaMonthly?: number;
  /** Expected customer lifetime in months — drives LTV. */
  avgCustomerLifetimeMonths?: number;
  /** Monthly targets (scaled to the selected range). Only metrics you set appear in the Goals view. */
  goals?: Partial<Record<GoalMetric, number>>;
}

/**
 * Fill these in with real numbers per company. Left empty on purpose — the Unit
 * Economics and Goals sections stay hidden for a company until its figures are
 * entered here, so nothing on the dashboard is ever invented.
 *
 * Example (delete the comment and replace with real values):
 *   buildfire: {
 *     monthlyMarketingSpend: 40000,
 *     monthlySalesSpend: 25000,
 *     grossMarginPct: 75,
 *     arpaMonthly: 300,
 *     avgCustomerLifetimeMonths: 24,
 *     goals: { newMqls: 500, demosBooked: 250, wonDeals: 40, newPipelineValue: 1_500_000 },
 *   },
 */
export const companyEconomics: Record<string, CompanyEconomics> = {
  convox: {},
  polymer: {},
  buildfire: {},
  avenue: {},
  uservoice: {},
};

export function getCompanyEconomics(companyId: string): CompanyEconomics {
  return companyEconomics[companyId] ?? {};
}
