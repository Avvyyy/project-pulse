import type { IncidentTimeline as TL, TimelineType } from '../types';
import { formatDateTimeShort } from '../utils/time';

const ICON: Record<TimelineType, string> = {
  opened:         '🔴',
  status_change:  '🔄',
  comment:        '💬',
  error_linked:   '🔗',
  resolved:       '✅',
  severity_change: '⚠️',
};

const DOT_CLASS: Record<TimelineType, string> = {
  opened:         'border-red-500',
  status_change:  'border-blue-500',
  comment:        'border-violet-500',
  error_linked:   'border-amber-500',
  resolved:       'border-emerald-500',
  severity_change: 'border-orange-500',
};

export function IncidentTimeline({ entries }: { entries: TL[] }) {
  if (entries.length === 0) {
    return <p className="text-slate-500 text-sm">No timeline events yet.</p>;
  }

  return (
    <ol className="relative space-y-6">
      <div className="absolute left-4 top-0 bottom-0 w-px bg-edge" />
      {entries.map((entry) => (
        <li key={entry.id} className="flex gap-4 relative">
          <div className={`shrink-0 w-8 h-8 rounded-full bg-surface border-2 flex items-center justify-center text-sm z-10 ${DOT_CLASS[entry.type] ?? 'border-edge'}`}>
            {ICON[entry.type] ?? '•'}
          </div>
          <div className="pt-1 min-w-0">
            <p className="text-slate-200 text-sm leading-relaxed">{entry.message}</p>
            <p className="text-slate-500 text-xs mt-1">
              {formatDateTimeShort(entry.occurredAt)}
              {entry.actor && <> · <span className="text-slate-400">{entry.actor}</span></>}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
