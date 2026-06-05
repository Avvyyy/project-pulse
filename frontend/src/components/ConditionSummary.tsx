import type { AlertCondition } from '../types';

function fmtSeconds(s: number): string {
  if (s < 60)   return `${s}s`;
  if (s < 3600) return `${s / 60}m`;
  return `${s / 3600}h`;
}

export function describeCondition(cond: AlertCondition): string {
  switch (cond.type) {
    case 'threshold': {
      const metric = cond.metric === 'error_count' ? 'errors' : 'events';
      return `${metric} > ${cond.threshold} in ${fmtSeconds(cond.windowSeconds)}`;
    }
    case 'spike':
      return `${cond.multiplier}× spike over ${fmtSeconds(cond.windowSeconds ?? 300)} vs ${fmtSeconds(cond.baselineWindowSeconds)} baseline`;
    case 'recurrence':
      return `recurring errors within ${cond.minutes}m`;
    case 'new_error_group':
      return 'new error group detected';
  }
}

export function ConditionSummary({ condition }: { condition: AlertCondition }) {
  return (
    <span className="text-slate-300 text-sm font-mono">{describeCondition(condition)}</span>
  );
}

/** Expanded view showing all condition parameters as a definition list. */
export function ConditionDetail({ condition }: { condition: AlertCondition }) {
  const rows: [string, string][] = [];

  rows.push(['Type', condition.type.replace(/_/g, ' ')]);

  if (condition.type === 'threshold') {
    rows.push(['Metric',    condition.metric === 'error_count' ? 'Error count' : 'Event count']);
    rows.push(['Threshold', String(condition.threshold)]);
    rows.push(['Window',    fmtSeconds(condition.windowSeconds)]);
  }
  if (condition.type === 'spike') {
    rows.push(['Multiplier',       `×${condition.multiplier}`]);
    rows.push(['Current window',   fmtSeconds(condition.windowSeconds ?? 300)]);
    rows.push(['Baseline window',  fmtSeconds(condition.baselineWindowSeconds)]);
  }
  if (condition.type === 'recurrence') {
    rows.push(['Within', `${condition.minutes} minutes`]);
  }

  return (
    <dl className="flex flex-col gap-2.5">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between items-center">
          <dt className="text-xs uppercase tracking-wider text-slate-500">{k}</dt>
          <dd className="text-sm text-slate-200 font-semibold">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
