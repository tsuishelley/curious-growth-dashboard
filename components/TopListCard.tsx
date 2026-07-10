import type { SourceType } from "@/lib/config/portfolio";
import { SOURCE_LABELS } from "@/lib/sourceLabels";

interface TopListCardProps {
  title: string;
  items: { label: string; value: number }[];
  source?: SourceType;
}

export default function TopListCard({ title, items, source }: TopListCardProps) {
  const maxValue = Math.max(...items.map((i) => i.value), 1);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-sm font-medium text-slate-700">{title}</p>
      <div className="mt-3 space-y-2">
        {items.map((item) => (
          <div key={item.label}>
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="truncate pr-2">{item.label}</span>
              <span className="shrink-0">{item.value.toLocaleString()}</span>
            </div>
            <div className="mt-1 h-1.5 rounded bg-slate-100">
              <div
                className="h-1.5 rounded bg-brand-500"
                style={{ width: `${item.value === 0 ? 0 : Math.max((item.value / maxValue) * 100, 4)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      {source && <p className="mt-3 text-[11px] text-slate-400">Source: {SOURCE_LABELS[source]}</p>}
    </div>
  );
}
