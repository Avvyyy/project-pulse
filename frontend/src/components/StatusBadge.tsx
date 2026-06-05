import type { IncidentStatus } from '../types';

const CLASSES: Record<IncidentStatus, { badge: string; dot: string; label: string }> = {
  open:          { badge: 'bg-amber-950  text-amber-400',   dot: 'bg-amber-500',   label: 'Open' },
  investigating: { badge: 'bg-blue-950   text-blue-400',    dot: 'bg-blue-500',    label: 'Investigating' },
  resolved:      { badge: 'bg-emerald-950 text-emerald-400', dot: 'bg-emerald-500', label: 'Resolved' },
};

export function StatusBadge({ status }: { status: IncidentStatus }) {
  const { badge, dot, label } = CLASSES[status] ?? CLASSES.open;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-semibold uppercase tracking-wider ${badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}
