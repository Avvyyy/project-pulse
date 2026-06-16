import { useEffect, useState } from 'react';
import { searchApi } from '../api/search';
import type { Event } from '../types';
import type { TopErrorGroup } from '../api/dashboard';
import { relativeTime, formatDateTimeShort } from '../utils/time';
import { LEVEL_TEXT_CLASS } from '../utils/colors';

interface Props {
  group: TopErrorGroup;
}

export function GroupEventsAccordion({ group }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<Event[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!expanded || events.length > 0) return;

    setLoading(true);
    setError(null);

    searchApi.getGroupEvents(group.id, 1, 5)
      .then((page) => setEvents(page.results))
      .catch((err) => setError(err?.message ?? 'Unable to load events'))
      .finally(() => setLoading(false));
  }, [expanded, events.length, group.id]);

  return (
    <div className="bg-surface border border-edge rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full px-5 py-4 flex items-center justify-between gap-3 text-left hover:bg-surface-2 transition-colors"
      >
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-100 truncate">{group.title}</p>
          <p className="text-xs text-slate-500 mt-1">{group.service} · {group.level.toUpperCase()} · {group.occurrenceCount.toLocaleString()} events</p>
        </div>
        <span className="text-xs text-slate-400">{expanded ? '−' : '+'}</span>
      </button>

      {expanded && (
        <div className="border-t border-edge px-5 py-4 space-y-3">
          <div className="flex flex-wrap gap-3 text-xs text-slate-500">
            <span>First seen {relativeTime(group.firstSeenAt)}</span>
            <span>Last seen {relativeTime(group.lastSeenAt)}</span>
          </div>

          {loading && <p className="text-slate-500 text-sm">Loading recent events…</p>}
          {error && <p className="text-red-400 text-sm">{error}</p>}

          {!loading && !error && events.length === 0 && (
            <p className="text-slate-500 text-sm">No recent events available for this group.</p>
          )}

          {!loading && events.length > 0 && (
            <div className="space-y-3">
              {events.map((event) => (
                <div key={event.id} className="rounded-xl border border-edge bg-canvas p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-slate-100 truncate">{event.message}</p>
                      <p className="text-xs text-slate-500 mt-1">{event.service} · {event.level.toUpperCase()}</p>
                    </div>
                    <span className={`text-xs font-semibold ${LEVEL_TEXT_CLASS[event.level] ?? 'text-slate-500'}`}>
                      {event.level.toUpperCase()}
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-slate-500 flex flex-wrap gap-2">
                    <span>{relativeTime(event.timestamp)}</span>
                    <span>{formatDateTimeShort(event.timestamp)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
