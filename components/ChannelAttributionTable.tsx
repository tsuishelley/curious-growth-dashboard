import type { FunnelStageValue } from "@/lib/types";

interface ChannelAttributionTableProps {
  title: string;
  channels: { channel: string; steps: FunnelStageValue[] }[];
  caveat?: string;
}

/**
 * The attribution funnel segmented by acquisition channel. Steps run down the
 * rows and channels across the columns (not the reverse) because step labels are
 * long sentences while channel names are short -- this keeps the header compact
 * and lets the labels have the full left column.
 */
export default function ChannelAttributionTable({ title, channels, caveat }: ChannelAttributionTableProps) {
  if (channels.length === 0) return null;

  const steps = channels[0].steps;
  const entryCountFor = (c: { steps: FunnelStageValue[] }) => c.steps[0]?.count ?? 0;
  const exitCountFor = (c: { steps: FunnelStageValue[] }) => c.steps[c.steps.length - 1]?.count ?? 0;

  return (
    <div className="border border-rule bg-paper p-5">
      <p className="label-mono text-ink-faint">{title}</p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr>
              <th className="label-mono sticky left-0 bg-paper pb-2 pr-4 text-left font-normal text-ink-faint">
                Step
              </th>
              {channels.map((c) => (
                <th key={c.channel} className="label-mono pb-2 pl-3 text-right font-normal text-ink-faint">
                  {c.channel}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {steps.map((step, i) => {
              const entryRow = i === 0;
              return (
                <tr key={step.key} className="border-t border-rule">
                  <td
                    className={`sticky left-0 max-w-[240px] truncate bg-paper py-2 pr-4 ${
                      entryRow ? "text-ink" : "text-ink-muted"
                    }`}
                    title={step.label}
                  >
                    {step.label}
                  </td>
                  {channels.map((c) => {
                    const count = c.steps[i]?.count ?? 0;
                    return (
                      <td
                        key={c.channel}
                        className={`py-2 pl-3 text-right font-mono ${count === 0 ? "text-ink-faint" : "text-ink"}`}
                      >
                        {count.toLocaleString()}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            <tr className="border-t-2 border-rule">
              <td className="label-mono sticky left-0 bg-paper py-2 pr-4 text-ink-faint">Conversion</td>
              {channels.map((c) => {
                const entered = entryCountFor(c);
                const exited = exitCountFor(c);
                const rate = entered > 0 ? exited / entered : 0;
                return (
                  <td
                    key={c.channel}
                    className={`py-2 pl-3 text-right font-mono ${rate > 0 ? "text-ink" : "text-ink-faint"}`}
                  >
                    {(rate * 100).toFixed(2)}%
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
      {caveat && (
        <p className="mt-4 border-l-2 border-accent pl-3 text-[11px] leading-relaxed text-ink-muted">{caveat}</p>
      )}
    </div>
  );
}
