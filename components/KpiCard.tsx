import type { SourceType } from "@/lib/config/portfolio";
import { SOURCE_LABELS } from "@/lib/sourceLabels";

interface KpiCardProps {
  label: string;
  value: string;
  changeFraction?: number | null; // e.g. 0.12 = +12%
  changeLabel?: string;
  source?: SourceType | SourceType[];
}

export default function KpiCard({ label, value, changeFraction, changeLabel = "vs prior week", source }: KpiCardProps) {
  const hasChange = changeFraction !== null && changeFraction !== undefined;
  const isPositive = hasChange && changeFraction! >= 0;
  const sources = source ? (Array.isArray(source) ? source : [source]) : [];

  return (
    <div className="border border-rule bg-paper p-5">
      <p className="label-mono text-ink-faint">{label}</p>
      <p className="mt-3 text-[32px] font-bold leading-none tracking-tight text-ink">{value}</p>
      {hasChange && (
        <p className={`mt-2.5 text-[11px] ${isPositive ? "text-positive" : "text-negative"}`}>
          {isPositive ? "▲" : "▼"} {Math.abs(changeFraction! * 100).toFixed(1)}%{" "}
          <span className="text-ink-faint">{changeLabel}</span>
        </p>
      )}
      {sources.length > 0 && (
        <p className="mt-3 text-[11px] text-ink-faint">
          Source: {sources.map((s) => SOURCE_LABELS[s]).join(", ")}
        </p>
      )}
    </div>
  );
}
