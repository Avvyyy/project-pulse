import type { IncidentErrorGroup } from '../types';

function serviceDot(levels: Set<string>) {
  if (levels.has('error')) return 'bg-red-500';
  if (levels.has('warn'))  return 'bg-amber-500';
  return 'bg-blue-500';
}

export function AffectedServices({ groups }: { groups: IncidentErrorGroup[] }) {
  const serviceMap = new Map<string, { errorCount: number; levels: Set<string> }>();

  for (const { errorGroup: g } of groups) {
    if (!serviceMap.has(g.service)) serviceMap.set(g.service, { errorCount: 0, levels: new Set() });
    const entry = serviceMap.get(g.service)!;
    entry.errorCount += g.occurrenceCount;
    entry.levels.add(g.level);
  }

  if (serviceMap.size === 0) {
    return <p className="text-slate-500 text-sm">None linked yet.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {Array.from(serviceMap.entries()).map(([name, { errorCount, levels }]) => (
        <li key={name} className="flex items-center gap-2.5 px-3 py-2 bg-canvas rounded-lg border border-edge">
          <span className={`w-2 h-2 rounded-full shrink-0 ${serviceDot(levels)}`} />
          <span className="flex-1 text-slate-200 text-sm font-medium truncate">{name}</span>
          <span className="text-slate-500 text-xs">{errorCount.toLocaleString()} events</span>
        </li>
      ))}
    </ul>
  );
}
