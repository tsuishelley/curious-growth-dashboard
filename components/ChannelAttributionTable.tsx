interface ChannelAttributionTableProps {
  title: string;
  rows: { channel: string; visited: number; converted: number; conversionRate: number }[];
  caveat?: string;
}

export default function ChannelAttributionTable({ title, rows, caveat }: ChannelAttributionTableProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-sm font-medium text-slate-700">{title}</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-slate-400">
              <th className="pb-2 font-medium">Channel</th>
              <th className="pb-2 pl-3 text-right font-medium">Visited</th>
              <th className="pb-2 pl-3 text-right font-medium">Converted</th>
              <th className="pb-2 pl-3 text-right font-medium">Rate</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.channel} className="border-t border-slate-100">
                <td className="py-1.5 text-slate-700">{r.channel}</td>
                <td className="py-1.5 pl-3 text-right text-slate-500">{r.visited.toLocaleString()}</td>
                <td className="py-1.5 pl-3 text-right text-slate-500">{r.converted.toLocaleString()}</td>
                <td className="py-1.5 pl-3 text-right text-slate-500">{(r.conversionRate * 100).toFixed(2)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {caveat && <p className="mt-3 text-[11px] text-amber-600">⚠ {caveat}</p>}
    </div>
  );
}
