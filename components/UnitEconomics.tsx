import type { UnitEconomics as UnitEconomicsData } from "@/lib/economics";
import KpiCard from "@/components/KpiCard";

/**
 * Renders CAC / LTV / payback / margin / ROI from a company's hand-entered cost
 * inputs (lib/config/economics.ts) combined with real period data. Returns null
 * when there's nothing computable yet, so the section stays hidden until inputs
 * exist rather than showing empty or invented cards.
 */
export default function UnitEconomics({ data, rangeLabel }: { data: UnitEconomicsData; rangeLabel: string }) {
  const cards: { label: string; value: string; hint: string }[] = [];

  if (data.cac != null) {
    cards.push({
      label: `CAC (${rangeLabel})`,
      value: `$${data.cac.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
      hint: "Customer acquisition cost = marketing + sales spend for the period ÷ new customers won (HubSpot won deals, or PostHog paid conversions for self-serve). Spend is your monthly figure scaled to the selected range.",
    });
  }
  if (data.ltvCacRatio != null) {
    cards.push({
      label: "LTV : CAC",
      value: `${data.ltvCacRatio.toFixed(1)}×`,
      hint: "Lifetime value ÷ CAC. A common rule of thumb is 3× or higher is healthy; below ~1× you're losing money on each customer.",
    });
  }
  if (data.paybackMonths != null) {
    cards.push({
      label: "CAC Payback",
      value: `${data.paybackMonths.toFixed(1)} mo`,
      hint: "Months to recoup CAC from gross-margin ARPA (average revenue per account × margin). Lower is better; under ~12 months is typically strong for SaaS.",
    });
  }
  if (data.ltv != null) {
    cards.push({
      label: "LTV",
      value: `$${data.ltv.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
      hint: "Lifetime value = ARPA × gross margin × expected customer lifetime (months). All three are your inputs in the economics config.",
    });
  }
  if (data.grossMarginPct != null) {
    cards.push({
      label: "Gross Margin",
      value: `${data.grossMarginPct.toFixed(0)}%`,
      hint: "Your entered blended gross margin. Used for gross profit, LTV, and payback.",
    });
  }
  if (data.grossProfit != null) {
    cards.push({
      label: `Gross Profit (${rangeLabel})`,
      value: `$${data.grossProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
      hint: "Period revenue × gross margin. Revenue is real (PostHog paid events, or HubSpot won-deal value); margin is your input.",
    });
  }
  if (data.roi != null) {
    cards.push({
      label: `Marketing + Sales ROI (${rangeLabel})`,
      value: `${(data.roi * 100).toFixed(0)}%`,
      hint: "(Gross profit − marketing & sales spend) ÷ spend, for the period. Positive means the period's gross profit more than covered blended S&M cost.",
    });
  }

  if (cards.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h3 className="font-display text-lg text-ink">Unit Economics</h3>
        <span className="label-mono text-ink-faint">lagging indicators</span>
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {cards.map((c) => (
          <KpiCard key={c.label} label={c.label} value={c.value} hint={c.hint} />
        ))}
      </div>
      {data.roi != null && (
        <p className="border-l-2 border-accent pl-3 text-[12px] leading-relaxed text-ink-muted">
          A note on ROI by channel: don&apos;t just pour budget into the highest-ROI channel and cut the rest. Channels
          have synergy — brand and upper-funnel demand from one channel often lifts the measured conversion of another,
          so starving them can drag down your top performer too. Treat channel ROI as one input, not the whole decision.
        </p>
      )}
    </div>
  );
}
