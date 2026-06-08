import type { IncidentErrorGroup } from '../types';
import { LEVEL_TEXT_CLASS } from '../utils/colors';
import { relativeTime } from '../utils/time';

const GROUP_STATUS_CLASS: Record<string, string> = {
  open:     'bg-amber-950  text-amber-400',
  resolved: 'bg-emerald-950 text-emerald-400',
  ignored:  'bg-slate-800  text-slate-400',
};

const TH = 'px-3 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-edge';
const TD = 'px-3 py-2.5 text-sm text-slate-300 border-b border-surface-2 align-middle';

export function RelatedErrors({ groups }: { groups: IncidentErrorGroup[] }) {
  if (groups.length === 0) {
    return <p className="text-slate-500 text-sm">No error groups linked yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={TH}>Title</th>
            <th className={TH}>Service</th>
            <th className={TH}>Level</th>
            <th className={`${TH} text-right`}>Occurrences</th>
            <th className={TH}>Status</th>
            <th className={TH}>Last Seen</th>
          </tr>
        </thead>
        <tbody>
          {groups.map(({ errorGroup: g }) => (
            <tr key={g.id} className="hover:bg-surface-2 transition-colors">
              <td className={`${TD} max-w-xs`}>
                <span className="block truncate text-slate-100">{g.title}</span>
                <span className="text-xs text-slate-600">{g.fingerprint.slice(0, 12)}…</span>
              </td>
              <td className={TD}>{g.service}</td>
              <td className={TD}>
                <span className={`text-xs font-bold ${LEVEL_TEXT_CLASS[g.level] ?? 'text-slate-500'}`}>
                  {g.level.toUpperCase()}
                </span>
              </td>
              <td className={`${TD} text-right text-slate-100 font-semibold`}>
                {g.occurrenceCount.toLocaleString()}
              </td>
              <td className={TD}>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded ${GROUP_STATUS_CLASS[g.status] ?? GROUP_STATUS_CLASS.ignored}`}>
                  {g.status}
                </span>
              </td>
              <td className={`${TD} text-slate-500 text-xs`}>{relativeTime(g.lastSeenAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
