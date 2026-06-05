import type { IncidentSeverity } from '../types';

const CLASSES: Record<IncidentSeverity, string> = {
  critical: 'bg-red-950    text-red-400',
  high:     'bg-orange-950 text-orange-400',
  medium:   'bg-yellow-950 text-yellow-400',
  low:      'bg-green-950  text-green-400',
};

export function SeverityBadge({ severity }: { severity: IncidentSeverity }) {
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded text-xs font-bold uppercase tracking-widest ${CLASSES[severity] ?? CLASSES.low}`}>
      {severity}
    </span>
  );
}
