import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { api, setToken } from '@/lib/api';
import { toast, useAuth } from '@/lib/store';
import { Btn, Input, Field, Logo } from '@/components/ui-kit';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const { reload } = useAuth();
  const loc = useLocation() as { state?: { from?: string } };

  async function submit() {
    if (busy) return;
    setBusy(true);
    try {
      const { token } = await api<{ token: string }>('/auth/login', { username, password });
      setToken(token);
      await reload();
      const from = loc.state?.from;
      if (from && from !== '/login') location.href = from;
      else location.href = '/';
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-svh flex-col justify-center px-7 pt-safe pb-safe">
      <div className="mb-10 text-center">
        <div className="mb-4 flex justify-center">
          <Logo size={76} />
        </div>
        <h1 className="squiggle inline-block text-4xl font-bold tracking-wide">破釜</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
          把退路烧掉的减肥应用
          <br />
          军令状 · 周契约 · 罚金 · 公开记录
        </p>
      </div>
      <div className="space-y-4">
        <Field label="用户名">
          <Input value={username} onChange={(e) => setUsername(e.target.value.trim())} autoCapitalize="off" placeholder="你的代号" />
        </Field>
        <Field label="密码">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="≥ 6 位"
          />
        </Field>
        <Btn size="lg" block disabled={busy || !username || !password} onClick={submit}>
          {busy ? '登录中…' : '归队'}
        </Btn>
      </div>
      <div className="mt-8 text-center text-[13px] text-muted-foreground">
        还没立过状？{' '}
        <Link to="/register" className="font-bold text-brand">
          注册
        </Link>
      </div>
    </div>
  );
}
