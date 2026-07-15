import type { SourceType } from "@/lib/config/portfolio";
import { SOURCE_LABELS } from "@/lib/sourceLabels";

interface FunnelChartProps {
  title?: string;
  stages: { key: string; label: string; count: number }[];
  source?: SourceType | SourceType[];
  /**
   * "sequential" (default): each stage flows from the one before it, so we show
   * "% of previous stage" — right for a true funnel like Visitor→Lead→MQL→Customer.
   * "snapshot": stages are a point-in-time distribution (e.g. currently-open deals
   * per pipeline stage), where "% of previous stage" is meaningless since stages
   * aren't cumulative — show "% of total" instead.
   */
  mode?: "sequential" | "snapshot";
}

export default function FunnelChart({ title = "Funnel", stages, source, mode = "sequential" }: FunnelChartProps) {
  const sources = source ? (Array.isArray(source) ? source : [source]) : [];
  const maxCount = Math.max(...stages.map((s) => s.count), 1);
  const totalCount = stages.reduce((sum, s) => sum + s.count, 0);

  return (
    <div className="border border-rule bg-paper p-5">
      <p className="label-mono text-ink-faint">{title}</p>
      <div className="mt-5 space-y-3.5">
        {stages.map((stage, i) => {
          const widthPct = stage.count === 0 ? 0 : Math.max((stage.count / maxCount) * 100, 4);
          const prev = stages[i - 1];
          const conversionFromPrev =
            mode === "sequential" && prev && prev.count > 0 ? stage.count / prev.count : null;
          const shareOfTotal = mode === "snapshot" && totalCount > 0 ? stage.count / totalCount : null;

          return (
            <div key={stage.key}>
              <div className="flex items-baseline justify-between text-[12px]">
                <span className="truncate pr-3 text-ink-muted">{stage.label}</span>
                <span className="shrink-0">
                  <span className="font-mono text-ink">{stage.count.toLocaleString()}</span>
                  {conversionFromPrev !== null && (
                    <span className="ml-2 text-ink-faint">
                      ({(conversionFromPrev * 100).toFixed(1)}% of {prev.label})
                    </span>
                  )}
                  {shareOfTotal !== null && (
                    <span className="ml-2 text-ink-faint">({(shareOfTotal * 100).toFixed(1)}% of total)</span>
                  )}
                </span>
              </div>
              <div className="mt-1.5 h-5 bg-canvas">
                <div className="h-5 bg-ink" style={{ width: `${widthPct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      {sources.length > 0 && (
        <p className="mt-4 text-[12px] text-ink-faint">Source: {sources.map((s) => SOURCE_LABELS[s]).join(", ")}</p>
      )}
    </div>
  );
}
