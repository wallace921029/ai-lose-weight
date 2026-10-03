import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { api, getToken, clearToken } from './api';
import type { Today, User } from './types';

// ---------- 认证 ----------

interface AuthCtx {
  user: User | null;
  hasPledge: boolean;
  loading: boolean;
  reload: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthCtx>(null as never);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [hasPledge, setHasPledge] = useState(false);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setHasPledge(false);
      setLoading(false);
      return;
    }
    try {
      const b = await api<{ user: User; hasPledge: boolean }>('/bootstrap');
      setUser(b.user);
      setHasPledge(b.hasPledge);
    } catch {
      setUser(null);
      setHasPledge(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
    location.href = '/login';
  }, []);

  return (
    <AuthContext.Provider value={{ user, hasPledge, loading, reload, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

// ---------- 今日数据 ----------

interface TodayCtx {
  today: Today | null;
  reload: () => Promise<void>;
}

const TodayContext = createContext<TodayCtx>(null as never);

export function TodayProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [today, setToday] = useState<Today | null>(null);

  const reload = useCallback(async () => {
    if (!user) return;
    try {
      setToday(await api<Today>('/today'));
    } catch {
      /* 静默，下个动作会再拉 */
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setToday(null);
      return;
    }
    reload();
    const on = () => reload();
    window.addEventListener('pofu:refresh', on);
    return () => window.removeEventListener('pofu:refresh', on);
  }, [user, reload]);

  return <TodayContext.Provider value={{ today, reload }}>{children}</TodayContext.Provider>;
}

export const useToday = () => useContext(TodayContext);

// ---------- Toast ----------

let toastSeq = 0;

export function toast(message: string, kind: 'info' | 'error' | 'good' = 'info') {
  window.dispatchEvent(
    new CustomEvent('pofu:toast', { detail: { id: ++toastSeq, message, kind } }),
  );
}

export function ToastHost() {
  const [items, setItems] = useState<{ id: number; message: string; kind: string }[]>([]);
  useEffect(() => {
    const on = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setItems((prev) => [...prev, detail]);
      setTimeout(() => {
        setItems((prev) => prev.filter((x) => x.id !== detail.id));
      }, 2600);
    };
    window.addEventListener('pofu:toast', on);
    return () => window.removeEventListener('pofu:toast', on);
  }, []);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-4">
      {items.map((t) => (
        <div
          key={t.id}
          className={`max-w-sm border-2 border-ink px-4 py-2.5 text-sm font-medium ink-shadow-xs ${
            t.kind === 'error'
              ? 'bg-brand text-white'
              : t.kind === 'good'
                ? 'bg-good text-[#0e3d2b]'
                : 'bg-paper text-ink'
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
