import type { WeeklyInsight } from "@/lib/types";

// Renders **bold** spans within a line; leaves the rest as plain text.
function renderInline(text: string, keyPrefix: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={`${keyPrefix}-${i}`} className="font-bold text-ink">
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
    <div className="border border-rule bg-paper p-8">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="label-mono text-accent">AI Weekly Insights</h3>
        <span className="label-mono text-ink-faint">
          {insight.weekId} · {new Date(insight.generatedAt).toLocaleDateString()}
        </span>
      </div>
      <ul className="mt-5 space-y-2.5">
        {bullets.map((b, i) => (
          <li key={i} className="flex gap-3 text-[14px] leading-relaxed text-ink-muted">
            <span className="mt-[7px] h-[3px] w-[3px] shrink-0 rounded-full bg-ink-faint" />
            <span>{renderInline(b, `b${i}`)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
