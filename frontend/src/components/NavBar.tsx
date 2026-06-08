import { Link, NavLink } from 'react-router-dom';

interface Crumb {
  label: string;
  href?: string;
}

interface NavBarProps {
  breadcrumbs: Crumb[];
}

const NAV_SECTIONS = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/incidents', label: 'Incidents' },
  { to: '/alerts',    label: 'Alerts'    },
];

export function NavBar({ breadcrumbs }: NavBarProps) {
  return (
    <header className="h-14 border-b border-edge bg-surface flex items-center gap-4 px-6 shrink-0">
      <Link to="/" className="text-lg font-bold text-slate-100 tracking-tight shrink-0">
        ⚡ Project Pulse
      </Link>

      {/* global section nav */}
      <nav className="flex items-center gap-1">
        {NAV_SECTIONS.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `px-3 py-1.5 rounded-md text-sm transition-colors ${
                isActive
                  ? 'text-accent bg-accent/10 font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-surface-2'
              }`
            }>
            {label}
          </NavLink>
        ))}
      </nav>

      {/* breadcrumb trail for current page */}
      {breadcrumbs.length > 0 && (
        <>
          <span className="text-edge">|</span>
          <nav className="flex items-center gap-2 text-sm min-w-0">
            {breadcrumbs.map((crumb, i) => (
              <span key={i} className="flex items-center gap-2 min-w-0">
                {i > 0 && <span className="text-edge shrink-0">/</span>}
                {crumb.href ? (
                  <Link to={crumb.href} className="text-slate-400 hover:text-slate-200 transition-colors shrink-0">
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="text-slate-300 truncate">{crumb.label}</span>
                )}
              </span>
            ))}
          </nav>
        </>
      )}
    </header>
  );
}
