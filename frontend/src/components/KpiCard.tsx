interface KpiCardProps {
  label:     string;
  value:     string | number;
  /** Positive = good, negative = bad, or override with badWhenPositive */
  delta?:    number;
  deltaLabel?: string;
  /** If true, a positive delta is rendered red (e.g. error counts). */
  badWhenPositive?: boolean;
  subtext?:  string;
  alert?:    boolean;   // highlights the card border red
}

function fmtDelta(n: number) {
  if (n === 0) return '±0';
  return n > 0 ? `+${n.toLocaleString()}` : n.toLocaleString();
}

export function KpiCard({ label, value, delta, deltaLabel, badWhenPositive, subtext, alert }: KpiCardProps) {
  let deltaColor = 'text-slate-500';
  if (delta !== undefined && delta !== 0) {
    const isGood = badWhenPositive ? delta < 0 : delta > 0;
    deltaColor = isGood ? 'text-emerald-400' : 'text-red-400';
  }

  return (
    <div className={`bg-surface border rounded-xl px-5 py-4 flex flex-col gap-1 ${alert ? 'border-red-800' : 'border-edge'}`}>
      <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</span>
      <span className="text-2xl font-bold text-slate-100 tabular-nums leading-tight">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </span>
      {delta !== undefined && (
        <span className={`text-xs font-semibold ${deltaColor}`}>
          {fmtDelta(delta)}{deltaLabel ?? ' vs prev period'}
        </span>
      )}
      {subtext && <span className="text-xs text-slate-500">{subtext}</span>}
    </div>
  );
}
