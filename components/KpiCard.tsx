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
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
      {hasChange && (
        <p className={`mt-1 text-xs font-medium ${isPositive ? "text-emerald-600" : "text-red-600"}`}>
          {isPositive ? "▲" : "▼"} {Math.abs(changeFraction! * 100).toFixed(1)}% {changeLabel}
        </p>
      )}
      {sources.length > 0 && (
        <p className="mt-2 text-[11px] text-slate-400">Source: {sources.map((s) => SOURCE_LABELS[s]).join(", ")}</p>
      )}
    </div>
  );
}
