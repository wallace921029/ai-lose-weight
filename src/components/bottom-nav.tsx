import { NavLink } from 'react-router';
import { cn } from 'cn';
import { useToday } from '@/lib/store';

const icons = {
  today: (
    <path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 4v5l3.5 2" strokeLinecap="round" />
  ),
  log: <path d="M4 19V5m0 14h16M7 14l3.5-5 3 3.5L19 6" strokeLinecap="round" strokeLinejoin="round" />,
  contract: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <circle cx="12" cy="10" r="3.2" />
      <path d="M9 16.5h6" strokeLinecap="round" />
    </>
  ),
  square: (
    <>
      <circle cx="8" cy="9" r="3" />
      <circle cx="16.5" cy="10.5" r="2.5" />
      <path d="M3.5 19c.5-2.8 2.3-4.2 4.5-4.2s4 1.4 4.5 4.2M13 18.8c.4-2.2 1.8-3.4 3.5-3.4 1.6 0 3.1 1.1 3.7 3.1" strokeLinecap="round" />
    </>
  ),
  me: (
    <>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5 20c.8-3.6 3.4-5.4 7-5.4s6.2 1.8 7 5.4" strokeLinecap="round" />
    </>
  ),
} as const;

const TABS = [
  { to: '/', label: '今日', icon: icons.today, exact: true },
  { to: '/log', label: '记录', icon: icons.log },
  { to: '/contract', label: '契约', icon: icons.contract },
  { to: '/square', label: '广场', icon: icons.square },
  { to: '/me', label: '我的', icon: icons.me },
];

export function BottomNav() {
  const { today } = useToday();
  const alarm = today && !today.weighed;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-ink bg-paper/95 backdrop-blur-xl pb-safe">
      <div className="mx-auto flex max-w-lg items-stretch justify-around px-2 pt-2 pb-2">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.exact}
            className={({ isActive }) =>
              cn(
                'relative flex min-w-14 flex-col items-center gap-0.5 px-2.5 py-1.5 text-[11px] font-medium transition-all',
                isActive
                  ? 'wob-sm border-2 border-ink bg-brand text-white ink-shadow-xs'
                  : 'text-ink-soft active:scale-95',
              )
            }
          >
            <svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinejoin="round">
              {t.icon}
            </svg>
            {t.label}
            {alarm && t.exact && (
              <span className="absolute -top-1.5 -right-1.5 size-2.5 rounded-full border border-ink bg-warn">
                <span className="absolute inset-0 animate-ping rounded-full bg-warn" />
              </span>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
