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

export default function TrendChart({ title, data, color = "#3457d5", source }: TrendChartProps) {
  // ResponsiveContainer measures its parent via ResizeObserver on mount, which
  // can race with hydration in Next.js and render at 0 width — deferring the
  // chart to a post-mount render reliably avoids the blank-on-first-load bug.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-sm font-medium text-slate-700">{title}</p>
      <div className="mt-2 h-48">
        {mounted && (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                tickFormatter={(d: string) => d.slice(5)}
                minTickGap={24}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                width={56}
                tickFormatter={(v: number) =>
                  v >= 1000 ? `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : v.toLocaleString()
                }
              />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                labelFormatter={(d) => d as string}
              />
              <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
      {source && <p className="mt-2 text-[11px] text-slate-400">Source: {SOURCE_LABELS[source]}</p>}
    </div>
  );
}
