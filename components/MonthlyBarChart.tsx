"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SourceType } from "@/lib/config/portfolio";
import { SOURCE_LABELS } from "@/lib/sourceLabels";

interface MonthlyBarChartProps {
  title: string;
  /** Daily points; bucketed into calendar-month totals here. */
  data: { date: string; value: number }[];
  source?: SourceType;
  /** Formats a bucket total for the axis/tooltip (e.g. dollar amounts). Defaults to a compact number. */
  valueFormatter?: (v: number) => string;
}

// Recharts renders SVG, so it can't inherit Tailwind classes -- these mirror the
// `ink`/`rule` tokens in tailwind.config.ts and must be kept in sync (same as TrendChart).
const BAR_COLOR = "#1a1a1a";
const AXIS_COLOR = "#9c9890";
const RULE_COLOR = "#e5e2db";
const MONO_STACK = '"Atlas Typewriter", ui-monospace, Menlo, monospace';

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function defaultFormat(v: number): string {
  return v >= 1000 ? `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : v.toLocaleString();
}

export default function MonthlyBarChart({ title, data, source, valueFormatter = defaultFormat }: MonthlyBarChartProps) {
  // Same post-mount deferral as TrendChart: ResponsiveContainer can measure a
  // 0-width parent if it renders during hydration, blanking the chart.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Sum daily values into YYYY-MM buckets, preserving chronological order.
  const monthly = useMemo(() => {
    const totals = new Map<string, number>();
    for (const point of data) {
      const key = point.date.slice(0, 7); // YYYY-MM
      totals.set(key, (totals.get(key) ?? 0) + point.value);
    }
    return [...totals.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => {
        const monthIdx = Number(key.slice(5, 7)) - 1;
        return { month: MONTH_LABELS[monthIdx] ?? key, value };
      });
  }, [data]);

  return (
    <div className="border border-rule bg-paper p-5">
      <p className="label-mono text-ink-faint">{title}</p>
      <div className="mt-4 h-48">
        {mounted && (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <XAxis
                dataKey="month"
                tick={{ fontSize: 10, fill: AXIS_COLOR, fontFamily: MONO_STACK }}
                minTickGap={4}
                stroke={RULE_COLOR}
              />
              <YAxis
                tick={{ fontSize: 10, fill: AXIS_COLOR, fontFamily: MONO_STACK }}
                width={52}
                stroke={RULE_COLOR}
                tickFormatter={valueFormatter}
              />
              <Tooltip
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 0,
                  border: `1px solid ${RULE_COLOR}`,
                  fontFamily: MONO_STACK,
                }}
                cursor={{ fill: RULE_COLOR, fillOpacity: 0.4 }}
                formatter={(v: number) => [valueFormatter(v), title]}
              />
              <Bar dataKey="value" fill={BAR_COLOR} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
      {source && <p className="mt-3 text-[12px] text-ink-faint">Source: {SOURCE_LABELS[source]}</p>}
    </div>
  );
}
