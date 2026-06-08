import type { AlertState } from '../types';

const CLASSES: Record<AlertState, { badge: string; dot: string; label: string; pulse: boolean }> = {
  firing: { badge: 'bg-red-950  text-red-400',   dot: 'bg-red-500',   label: 'Firing', pulse: true  },
  ok:     { badge: 'bg-emerald-950 text-emerald-400', dot: 'bg-emerald-500', label: 'OK',     pulse: false },
  paused: { badge: 'bg-slate-800 text-slate-400', dot: 'bg-slate-500', label: 'Paused', pulse: false },
};

export function AlertStateBadge({ state }: { state: AlertState }) {
  const { badge, dot, label, pulse } = CLASSES[state];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-semibold uppercase tracking-wider ${badge}`}>
      <span className={`relative flex w-2 h-2`}>
        {pulse && (
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${dot} opacity-60`} />
        )}
        <span className={`relative inline-flex rounded-full w-2 h-2 ${dot}`} />
      </span>
      {label}
    </span>
  );
}
