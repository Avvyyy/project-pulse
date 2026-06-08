import type { AlertTrigger } from '../types';
import { formatDateTime, formatDuration, relativeTime } from '../utils/time';

interface TriggerHistoryProps {
  triggers:  AlertTrigger[];
  onResolve?: (triggerId: string) => Promise<void>;
}

function TriggerContext({ ctx }: { ctx: Record<string, unknown> }) {
  const entries = Object.entries(ctx).filter(([, v]) => v !== null && !Array.isArray(v) && typeof v !== 'object');
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
      {entries.map(([k, v]) => (
        <span key={k} className="text-xs text-slate-500">
          <span className="text-slate-600 uppercase tracking-wider text-[10px]">{k.replace(/_/g, ' ')}</span>
          {' '}
          <span className="text-slate-300 font-semibold">{String(v)}</span>
        </span>
      ))}
    </div>
  );
}

export function TriggerHistory({ triggers, onResolve }: TriggerHistoryProps) {
  if (triggers.length === 0) {
    return <p className="text-slate-500 text-sm">No triggers recorded yet.</p>;
  }

  return (
    <ol className="flex flex-col gap-3">
      {triggers.map((t) => {
        const firing  = !t.resolvedAt;
        const ctx     = (t.context ?? {}) as Record<string, unknown>;

        return (
          <li key={t.id} className={`rounded-lg border p-4 ${firing ? 'border-red-800 bg-red-950/30' : 'border-edge bg-surface-2'}`}>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                  firing ? 'bg-red-900 text-red-400' : 'bg-emerald-950 text-emerald-400'
                }`}>
                  {firing ? 'Firing' : 'Resolved'}
                </span>
                <span className="text-sm text-slate-300">{relativeTime(t.triggeredAt)}</span>
                <span className="text-xs text-slate-600">{formatDateTime(t.triggeredAt)}</span>
              </div>
              {!firing && t.resolvedAt && (
                <span className="text-xs text-slate-500">
                  resolved after {formatDuration(t.triggeredAt, t.resolvedAt)}
                </span>
              )}
              {firing && onResolve && (
                <button
                  onClick={() => onResolve(t.id)}
                  className="text-xs text-slate-300 border border-edge px-3 py-1 rounded hover:border-emerald-600 hover:text-emerald-400 transition-colors">
                  Resolve
                </button>
              )}
            </div>
            {Object.keys(ctx).length > 0 && <TriggerContext ctx={ctx} />}
          </li>
        );
      })}
    </ol>
  );
}
