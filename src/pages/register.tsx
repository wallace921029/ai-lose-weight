import { useState } from 'react';
import { Link } from 'react-router';
import { api, setToken } from '@/lib/api';
import { toast, useAuth } from '@/lib/store';
import { Btn, Input, Field, Logo } from '@/components/ui-kit';

export default function RegisterPage() {
  const [username, setUsername] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [busy, setBusy] = useState(false);
  const { reload } = useAuth();

  async function submit() {
    if (busy) return;
    setBusy(true);
    try {
      const { token } = await api<{ token: string }>('/auth/register', {
        username,
        password,
        nickname,
        inviteCode,
      });
      setToken(token);
      await reload();
      location.href = '/onboarding';
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-svh flex-col justify-center px-7 pt-safe pb-safe">
      <div className="mb-8 flex items-center gap-3">
        <Logo size={44} />
        <div>
          <div className="squiggle inline-block text-lg font-bold">注册 · 入营</div>
          <div className="mt-1 text-[12px] text-ink-soft">多用户共同监督，谁也别想悄悄胖</div>
        </div>
      </div>
      <div className="space-y-4">
        <Field label="邀请码" hint="入营凭证，找创始人要">
          <Input value={inviteCode} onChange={(e) => setInviteCode(e.target.value.trim())} autoCapitalize="off" placeholder="没有邀请码进不来" />
        </Field>
        <Field label="用户名" hint="中英文/数字/下划线">
          <Input value={username} onChange={(e) => setUsername(e.target.value.trim())} autoCapitalize="off" placeholder="登录用，别人可以加你为好友" />
        </Field>
        <Field label="昵称" hint="选填，广场展示">
          <Input value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={20} placeholder="默认同用户名" />
        </Field>
        <Field label="密码" hint="≥ 6 位">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="设一个狠一点的" />
        </Field>
        <Btn size="lg" block disabled={busy || !inviteCode || username.length < 2 || password.length < 6} onClick={submit}>
          {busy ? '注册中…' : '注册'}
        </Btn>
      </div>
      <div className="mt-6 text-center text-[12px] leading-relaxed text-muted-foreground">
        注册即代表同意：你的称重打卡、契约成败与信用分
        <br />
        将以事件形式在广场公开（不公开具体体重）
      </div>
      <div className="mt-4 text-center text-[13px] text-muted-foreground">
        已有账号？{' '}
        <Link to="/login" className="font-bold text-brand">
          登录
        </Link>
      </div>
    </div>
  );
}
