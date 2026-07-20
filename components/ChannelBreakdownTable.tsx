import type { ChannelDetail } from "@/lib/types";

/**
 * GA4 traffic broken out by acquisition channel — sessions, users, new users,
 * engaged sessions, engagement rate, conversions. Engagement rate and users are
 * the ones to watch (quality, not just volume). Scrolls horizontally on narrow
 * screens so the page body never does.
 */
export default function ChannelBreakdownTable({ channels, rangeLabel }: { channels: ChannelDetail[]; rangeLabel: string }) {
  if (channels.length === 0) return null;

  const cols: { key: keyof ChannelDetail; label: string; fmt: (c: ChannelDetail) => string }[] = [
    { key: "sessions", label: "Sessions", fmt: (c) => c.sessions.toLocaleString() },
    { key: "users", label: "Users", fmt: (c) => c.users.toLocaleString() },
    { key: "newUsers", label: "New users", fmt: (c) => c.newUsers.toLocaleString() },
    { key: "engagedSessions", label: "Engaged", fmt: (c) => c.engagedSessions.toLocaleString() },
    { key: "engagementRate", label: "Engmt. rate", fmt: (c) => `${(c.engagementRate * 100).toFixed(1)}%` },
    { key: "conversions", label: "Conversions", fmt: (c) => c.conversions.toLocaleString(undefined, { maximumFractionDigits: 1 }) },
  ];

  return (
    <div className="border border-rule bg-paper p-5">
      <p className="label-mono text-ink-faint">Traffic by Channel ({rangeLabel})</p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-[12px]">
          <thead>
            <tr className="border-b border-rule text-ink-faint">
              <th className="py-2 pr-3 text-left font-normal">Channel</th>
              {cols.map((col) => (
                <th key={col.key} className="py-2 pl-3 text-right font-normal">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {channels.map((c) => (
              <tr key={c.channel} className="border-b border-rule last:border-0">
                <td className="py-2 pr-3 text-ink-muted">{c.channel}</td>
                {cols.map((col) => (
                  <td key={col.key} className="py-2 pl-3 text-right font-mono text-ink">
                    {col.fmt(c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[12px] text-ink-faint">Source: GA4</p>
    </div>
  );
}
