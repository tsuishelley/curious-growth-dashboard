import type { GoalProgress } from "@/lib/economics";

/** Formats a goal value compactly; dollar metrics get a $ prefix. */
function fmt(metric: string, v: number): string {
  const isMoney = metric === "newPipelineValue" || metric === "revenue";
  const rounded = Math.round(v);
  return isMoney ? `$${rounded.toLocaleString()}` : rounded.toLocaleString();
}

/** Status band for a goal's attainment, driving the label + color. */
function status(attainment: number): { label: string; className: string; bar: string } {
  if (attainment >= 1) return { label: "on track", className: "text-positive", bar: "bg-positive" };
  if (attainment >= 0.8) return { label: "slightly behind", className: "text-accent", bar: "bg-accent" };
  return { label: "below", className: "text-negative", bar: "bg-negative" };
}

/**
 * Goals vs. actuals for the selected range. Targets come from the hand-entered
 * monthly goals (scaled to the range); actuals are real connected data. Renders
 * nothing when no goals are set, so it stays hidden until targets exist.
 */
export default function GoalsCard({ goals, rangeLabel }: { goals: GoalProgress[]; rangeLabel: string }) {
  if (goals.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h3 className="font-display text-lg text-ink">Goals &amp; KPIs</h3>
        <span className="label-mono text-ink-faint">target scaled to {rangeLabel}</span>
      </div>
      <div className="border border-rule bg-paper">
        {goals.map((g, i) => {
          const s = status(g.attainment);
          const pct = Math.min(g.attainment, 1) * 100;
          return (
            <div key={g.metric} className={`p-4 ${i > 0 ? "border-t border-rule" : ""}`}>
              <div className="flex items-baseline justify-between gap-3 text-[12px]">
                <span className="text-ink-muted">{g.label}</span>
                <span className="shrink-0">
                  <span className="font-mono text-ink">{fmt(g.metric, g.actual)}</span>
                  <span className="text-ink-faint"> / {fmt(g.metric, g.target)}</span>
                  <span className={`ml-2 ${s.className}`}>
                    {(g.attainment * 100).toFixed(0)}% · {s.label}
                  </span>
                </span>
              </div>
              {/* Attainment bar caps its fill at 100% width; the % text above still shows overshoot. */}
              <div className="mt-2 h-2 bg-canvas">
                <div className={`h-2 ${s.bar}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
