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
    <div className="border border-rule bg-paper p-5">
      <p className="label-mono text-ink-faint">{title}</p>
      <div className="mt-4 space-y-2.5">
        {items.map((item) => (
          <div key={item.label}>
            <div className="flex items-center justify-between text-[11px] text-ink-muted">
              <span className="truncate pr-3">{item.label}</span>
              <span className="shrink-0 font-mono text-ink">{item.value.toLocaleString()}</span>
            </div>
            <div className="mt-1 h-[3px] bg-canvas">
              <div
                className="h-[3px] bg-ink"
                style={{ width: `${item.value === 0 ? 0 : Math.max((item.value / maxValue) * 100, 4)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      {source && <p className="mt-4 text-[11px] text-ink-faint">Source: {SOURCE_LABELS[source]}</p>}
    </div>
  );
}
