import type { WeeklyInsight } from "@/lib/types";

// Renders **bold** spans within a line; leaves the rest as plain text.
function renderInline(text: string, keyPrefix: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={`${keyPrefix}-${i}`} className="font-semibold text-slate-900">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={`${keyPrefix}-${i}`}>{part}</span>;
  });
}

export default function WeeklyInsights({ insight }: { insight: WeeklyInsight }) {
  const bullets = insight.summary
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => l.replace(/^[-*•]\s*/, ""));

  return (
    <div className="rounded-xl border border-brand-100 bg-brand-50 p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-brand-700">
          <span aria-hidden>✦</span> AI Weekly Insights
          <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-medium text-brand-600">
            {insight.weekId}
          </span>
        </h3>
        <span className="text-[11px] text-slate-400">
          Generated {new Date(insight.generatedAt).toLocaleDateString()}
        </span>
      </div>
      <ul className="mt-3 space-y-1.5">
        {bullets.map((b, i) => (
          <li key={i} className="flex gap-2 text-sm text-slate-700">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
            <span>{renderInline(b, `b${i}`)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
