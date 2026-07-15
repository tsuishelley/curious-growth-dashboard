interface ChannelAttributionTableProps {
  title: string;
  rows: { channel: string; visited: number; converted: number; conversionRate: number }[];
  caveat?: string;
}

export default function ChannelAttributionTable({ title, rows, caveat }: ChannelAttributionTableProps) {
  return (
    <div className="border border-rule bg-paper p-5">
      <p className="label-mono text-ink-faint">{title}</p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-left text-ink-faint">
              <th className="label-mono pb-2 font-normal">Channel</th>
              <th className="label-mono pb-2 pl-3 text-right font-normal">Visited</th>
              <th className="label-mono pb-2 pl-3 text-right font-normal">Converted</th>
              <th className="label-mono pb-2 pl-3 text-right font-normal">Rate</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.channel} className="border-t border-rule">
                <td className="py-2 text-ink-muted">{r.channel}</td>
                <td className="py-2 pl-3 text-right font-mono text-ink">{r.visited.toLocaleString()}</td>
                <td className="py-2 pl-3 text-right font-mono text-ink">{r.converted.toLocaleString()}</td>
                <td className="py-2 pl-3 text-right font-mono text-ink-muted">
                  {(r.conversionRate * 100).toFixed(2)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {caveat && (
        <p className="mt-4 border-l-2 border-accent pl-3 text-[11px] leading-relaxed text-ink-muted">{caveat}</p>
      )}
    </div>
  );
}
