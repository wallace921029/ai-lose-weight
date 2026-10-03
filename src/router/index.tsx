import { useEffect, useState } from 'react';
import { Navigate, Outlet, createBrowserRouter, Link, useLocation } from 'react-router';
import { AuthProvider, TodayProvider, useAuth, useToday } from '@/lib/store';
import { BottomNav } from '@/components/bottom-nav';
import { CoachFab } from '@/components/coach-fab';
import { Logo } from '@/components/ui-kit';
import LoginPage from '@/pages/login';
import RegisterPage from '@/pages/register';
import OnboardingPage from '@/pages/onboarding';
import TodayPage from '@/pages/today';
import LogPage from '@/pages/log';
import ContractPage from '@/pages/contract';
import SquarePage from '@/pages/square';
import MePage from '@/pages/me';
import FriendsAddPage from '@/pages/friends-add';
import AiConfigPage from '@/pages/ai-config';

function Splash() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-3">
      <Logo size={56} />
      <div className="text-sm text-muted-foreground">破釜</div>
    </div>
  );
}

function RequireAuth() {
  const { user, loading, hasPledge } = useAuth();
  const loc = useLocation();
  if (loading) return <Splash />;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  if (!hasPledge && loc.pathname !== '/onboarding') return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}

function AppShell() {
  const { today } = useToday();
  const alarm = today && !today.weighed;
  const pending = today && today.pendingStakes > 0;

  return (
    <div className="min-h-svh">
      {alarm && (
        <Link to="/" className="alarm block px-4 pt-safe text-center text-[13px] font-bold text-white">
          今日未称重 · 秤不会说谎，人才会
          {pending ? ` · 待缴罚金 ¥${today.pendingStakes}` : ''}
        </Link>
      )}
      <main className="mx-auto w-full max-w-lg px-4 pt-3 mb-safe-nav">
        <Outlet />
      </main>
      <BottomNav />
      <CoachFab />
      <InstallHint />
    </div>
  );
}

function InstallHint() {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem('pofu_install_hint'));
  const loc = useLocation();
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
  useEffect(() => {
    if (dismissed) localStorage.setItem('pofu_install_hint', '1');
  }, [dismissed]);
  if (standalone || dismissed || loc.pathname !== '/') return null;
  return (
    <div className="animate-in fade-in wob fixed inset-x-3 bottom-24 z-30 flex items-center gap-2.5 border-2 border-ink bg-popover p-3 ink-shadow">
      <Logo size={34} />
      <div className="min-w-0 flex-1 text-[12px] leading-snug">
        把<b>破釜</b>加到主屏幕，每天一开就是它 —— 步骤见「我的」页。
      </div>
      <button
        className="shrink-0 rounded-full border-2 border-ink bg-paper-2 px-3 py-1.5 text-xs font-semibold press"
        onClick={() => setDismissed('1')}
      >
        知道了
      </button>
    </div>
  );
}

function Bare() {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Splash />;
  if (user && loc.pathname !== '/onboarding') return <Navigate to="/" replace />;
  return <Outlet />;
}

export const router = createBrowserRouter(
  [
    {
      element: (
        <AuthProvider>
          <TodayProvider>
            <Outlet />
          </TodayProvider>
        </AuthProvider>
      ),
      children: [
        {
          path: '/login',
          element: <Bare />,
          children: [{ index: true, element: <LoginPage /> }],
        },
        {
          path: '/register',
          element: <Bare />,
          children: [{ index: true, element: <RegisterPage /> }],
        },
        {
          path: '/onboarding',
          element: <Bare />,
          children: [{ index: true, element: <OnboardingPage /> }],
        },
        {
          element: <RequireAuth />,
          children: [
            {
              element: <AppShell />,
              children: [
                { path: '/', element: <TodayPage /> },
                { path: '/log', element: <LogPage /> },
                { path: '/contract', element: <ContractPage /> },
                { path: '/square', element: <SquarePage /> },
                { path: '/friends/add', element: <FriendsAddPage /> },
                { path: '/me', element: <MePage /> },
                { path: '/ai-config', element: <AiConfigPage /> },
              ],
            },
          ],
        },
        { path: '*', element: <Navigate to="/" replace /> },
      ],
    },
  ] as any,
);
