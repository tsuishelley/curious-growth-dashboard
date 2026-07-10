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
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-sm font-medium text-slate-700">{title}</p>
      <div className="mt-4 space-y-3">
        {stages.map((stage, i) => {
          const widthPct = stage.count === 0 ? 0 : Math.max((stage.count / maxCount) * 100, 4);
          const prev = stages[i - 1];
          const conversionFromPrev =
            mode === "sequential" && prev && prev.count > 0 ? stage.count / prev.count : null;
          const shareOfTotal = mode === "snapshot" && totalCount > 0 ? stage.count / totalCount : null;

          return (
            <div key={stage.key}>
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>{stage.label}</span>
                <span>
                  {stage.count.toLocaleString()}
                  {conversionFromPrev !== null && (
                    <span className="ml-2 text-slate-400">
                      ({(conversionFromPrev * 100).toFixed(1)}% of {prev.label})
                    </span>
                  )}
                  {shareOfTotal !== null && (
                    <span className="ml-2 text-slate-400">({(shareOfTotal * 100).toFixed(1)}% of total)</span>
                  )}
                </span>
              </div>
              <div className="mt-1 h-6 rounded bg-slate-100">
                <div className="h-6 rounded bg-brand-500" style={{ width: `${widthPct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      {sources.length > 0 && (
        <p className="mt-3 text-[11px] text-slate-400">Source: {sources.map((s) => SOURCE_LABELS[s]).join(", ")}</p>
      )}
    </div>
  );
}
