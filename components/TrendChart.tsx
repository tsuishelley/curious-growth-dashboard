"use client";

import { useEffect, useState } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SourceType } from "@/lib/config/portfolio";
import { SOURCE_LABELS } from "@/lib/sourceLabels";

interface TrendChartProps {
  title: string;
  data: { date: string; value: number }[];
  color?: string;
  source?: SourceType;
}

// Recharts renders SVG, so it can't inherit Tailwind classes -- these mirror
// the `ink`/`rule`/`accent` tokens in tailwind.config.ts and must be kept in sync.
const AXIS_COLOR = "#9c9890";
const RULE_COLOR = "#e5e2db";
const MONO_STACK = '"Atlas Typewriter", ui-monospace, Menlo, monospace';

export default function TrendChart({ title, data, color = "#d9503f", source }: TrendChartProps) {
  // ResponsiveContainer measures its parent via ResizeObserver on mount, which
  // can race with hydration in Next.js and render at 0 width — deferring the
  // chart to a post-mount render reliably avoids the blank-on-first-load bug.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="border border-rule bg-paper p-5">
      <p className="label-mono text-ink-faint">{title}</p>
      <div className="mt-4 h-48">
        {mounted && (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: AXIS_COLOR, fontFamily: MONO_STACK }}
                tickFormatter={(d: string) => d.slice(5)}
                minTickGap={24}
                stroke={RULE_COLOR}
              />
              <YAxis
                tick={{ fontSize: 10, fill: AXIS_COLOR, fontFamily: MONO_STACK }}
                width={52}
                stroke={RULE_COLOR}
                tickFormatter={(v: number) =>
                  v >= 1000 ? `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : v.toLocaleString()
                }
              />
              <Tooltip
                contentStyle={{
                  fontSize: 11,
                  borderRadius: 0,
                  border: `1px solid ${RULE_COLOR}`,
                  fontFamily: MONO_STACK,
                }}
                labelFormatter={(d) => d as string}
              />
              {/* Animation off deliberately: Recharts draws the line by animating
                  stroke-dasharray, and when rAF is throttled (charts below the
                  fold, backgrounded tab) it freezes on the first frame -- leaving
                  ~1% of the line drawn and the data effectively invisible. */}
              <Line
                type="monotone"
                dataKey="value"
                stroke={color}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
      {source && <p className="mt-3 text-[11px] text-ink-faint">Source: {SOURCE_LABELS[source]}</p>}
    </div>
  );
}
