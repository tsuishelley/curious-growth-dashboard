"use client";

import { useMemo, useState } from "react";
import type { FunnelStageValue } from "@/lib/types";

interface AttributionFunnelProps {
  title: string;
  steps: FunnelStageValue[];
  byChannel: { channel: string; steps: FunnelStageValue[] }[];
  caveat?: string;
}

/**
 * Categorical scale for channel segments. Muted/warm so it sits with the paper
 * palette rather than fighting it. Capped at MAX_CHANNELS because colour stops
 * being a usable encoding past ~6 categories -- the rest fold into "Other".
 */
const CHANNEL_COLORS = [
  "#d9503f", // coral
  "#2f6f8f", // blue
  "#a8813a", // ochre
  "#2f7a55", // green
  "#7a6a9b", // purple
  "#b5654a", // terracotta
];
const OTHER_COLOR = "#9c9890";
const MAX_CHANNELS = 6;

/**
 * Visibility floors. A funnel that collapses hard (Convox: 5,713 -> 11) would
 * otherwise render every post-entry step as a sub-pixel sliver with nothing to
 * hover. The floors only affect bar *width*; the exact count and "% of prev" are
 * always printed next to each step, so the magnitude is never misread.
 */
const MIN_BAR_PCT = 6;
const MIN_SEGMENT_PCT = 4;

interface HoverState {
  stepIndex: number;
  channel: string;
  count: number;
  shareOfStep: number;
  shareOfEntry: number;
  color: string;
  x: number;
  y: number;
}

export default function AttributionFunnel({ title, steps, byChannel, caveat }: AttributionFunnelProps) {
  const [hover, setHover] = useState<HoverState | null>(null);

  // Collapse the long tail into "Other" so the colour scale stays readable.
  const channels = useMemo(() => {
    const entriesOf = (c: { steps: FunnelStageValue[] }) => c.steps[0]?.count ?? 0;
    const sorted = [...byChannel].sort((a, b) => entriesOf(b) - entriesOf(a));
    if (sorted.length <= MAX_CHANNELS) {
      return sorted.map((c, i) => ({ ...c, color: CHANNEL_COLORS[i % CHANNEL_COLORS.length] }));
    }
    const head = sorted.slice(0, MAX_CHANNELS).map((c, i) => ({ ...c, color: CHANNEL_COLORS[i] }));
    const tail = sorted.slice(MAX_CHANNELS);
    const otherSteps = steps.map((step, i) => ({
      ...step,
      count: tail.reduce((sum, c) => sum + (c.steps[i]?.count ?? 0), 0),
    }));
    return [...head, { channel: `Other (${tail.length})`, steps: otherSteps, color: OTHER_COLOR }];
  }, [byChannel, steps]);

  const entryTotal = steps[0]?.count ?? 0;
  if (entryTotal === 0) return null;

  return (
    <div className="border border-rule bg-paper p-5">
      <p className="label-mono text-ink-faint">{title}</p>

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5">
        {channels.map((c) => (
          <span key={c.channel} className="flex items-center gap-1.5 text-[11px] text-ink-muted">
            <span className="h-2 w-2 shrink-0" style={{ backgroundColor: c.color }} />
            {c.channel}
          </span>
        ))}
      </div>

      <div className="relative mt-5 space-y-3">
        {steps.map((step, i) => {
          const stepTotal = step.count;
          // Bar width is proportional to the funnel's entry step, which is what
          // makes the top-down taper read as a funnel. Zero stays zero; anything
          // non-zero gets floored so it survives as a hoverable target.
          const rawWidthPct = entryTotal > 0 ? (stepTotal / entryTotal) * 100 : 0;
          const widthPct = stepTotal === 0 ? 0 : Math.max(rawWidthPct, MIN_BAR_PCT);
          const prev = steps[i - 1];
          const fromPrev = prev && prev.count > 0 ? stepTotal / prev.count : null;

          return (
            <div key={step.key}>
              <div className="flex items-baseline justify-between gap-3 text-[11px]">
                <span className="truncate text-ink-muted" title={step.label}>
                  {step.label}
                </span>
                <span className="shrink-0">
                  <span className="font-mono text-ink">{stepTotal.toLocaleString()}</span>
                  {fromPrev !== null && (
                    <span className="ml-2 text-ink-faint">({(fromPrev * 100).toFixed(1)}% of prev)</span>
                  )}
                </span>
              </div>

              {/* Centred track gives the classic funnel taper; segments stack across it. */}
              <div className="mt-1.5 flex h-6 justify-center bg-canvas">
                <div className="flex h-6" style={{ width: `${widthPct}%` }}>
                  {channels.map((c) => {
                    const count = c.steps[i]?.count ?? 0;
                    if (count === 0) return null;
                    const rawPct = stepTotal > 0 ? (count / stepTotal) * 100 : 0;
                    const segPct = Math.max(rawPct, MIN_SEGMENT_PCT);
                    const entries = c.steps[0]?.count ?? 0;
                    return (
                      <div
                        key={c.channel}
                        className="h-6 cursor-default transition-opacity hover:opacity-80"
                        style={{ width: `${segPct}%`, backgroundColor: c.color }}
                        onMouseEnter={(e) => {
                          const r = e.currentTarget.getBoundingClientRect();
                          setHover({
                            stepIndex: i,
                            channel: c.channel,
                            count,
                            shareOfStep: rawPct,
                            shareOfEntry: entries > 0 ? (count / entries) * 100 : 0,
                            color: c.color,
                            x: r.left + r.width / 2,
                            y: r.top,
                          });
                        }}
                        onMouseLeave={() => setHover(null)}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {hover && (
        <div
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full border border-rule bg-paper px-3 py-2 shadow-sm"
          style={{ left: hover.x, top: hover.y - 8 }}
        >
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 shrink-0" style={{ backgroundColor: hover.color }} />
            <span className="label-mono text-ink">{hover.channel}</span>
          </div>
          <p className="mt-1.5 whitespace-nowrap text-[11px] text-ink-muted">
            <span className="font-mono text-ink">{hover.count.toLocaleString()}</span> at{" "}
            {steps[hover.stepIndex]?.label}
          </p>
          <p className="mt-0.5 whitespace-nowrap text-[11px] text-ink-faint">
            {hover.shareOfStep.toFixed(1)}% of this step · {hover.shareOfEntry.toFixed(2)}% of its own entries
          </p>
        </div>
      )}

      {caveat && (
        <p className="mt-5 border-l-2 border-accent pl-3 text-[11px] leading-relaxed text-ink-muted">{caveat}</p>
      )}
    </div>
  );
}
