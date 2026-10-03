import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '@/lib/api';
import { toast, useAuth } from '@/lib/store';
import { Avatar, Btn, Card, Empty, Input } from '@/components/ui-kit';

interface SearchUser {
  id: number;
  username: string;
  nickname: string;
  rel: 'none' | 'friends' | 'pending_out' | 'pending_in';
}

export default function FriendsAddPage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [users, setUsers] = useState<SearchUser[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [busyName, setBusyName] = useState('');

  // 防抖搜索
  useEffect(() => {
    if (!q.trim()) {
      setUsers(null);
      return;
    }
    setSearching(true);
    const t = setTimeout(() => {
      api<{ users: SearchUser[] }>(`/friends/search?q=${encodeURIComponent(q.trim())}`)
        .then((r) => setUsers(r.users))
        .catch(() => setUsers([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  async function add(u: SearchUser) {
    if (busyName) return;
    setBusyName(u.username);
    try {
      const r = await api<{ ok: boolean; autoAccepted?: boolean }>('/friends', { username: u.username });
      toast(r.autoAccepted ? '对方也申请过你，已直接成为好友' : '申请已发送', 'good');
      const rel = r.autoAccepted ? 'friends' : 'pending_out';
      setUsers((prev) => prev?.map((x) => (x.username === u.username ? { ...x, rel } : x)) ?? null);
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setBusyName('');
    }
  }

  return (
    <div className="space-y-3.5">
      {/* 顶部：返回 + 标题 */}
      <div className="flex items-center gap-2.5 pt-1">
        <button
          onClick={() => nav('/square')}
          aria-label="返回广场"
          className="flex size-9 items-center justify-center rounded-full border-2 border-ink bg-paper text-ink press"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <span className="text-lg font-bold">添加好友</span>
      </div>

      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoCapitalize="off"
        placeholder="搜索用户名或昵称"
        autoFocus
      />

      {users === null ? (
        <Card className="space-y-2 text-center">
          <div className="text-[14px]">搜到人之后发申请，对方同意就成为好友</div>
          <div className="text-[12px] text-ink-soft">
            把你的用户名 <b className="text-brand-deep">@{user?.username}</b> 发给朋友，让对方也加你
          </div>
        </Card>
      ) : searching ? (
        <Empty text="搜索中…" />
      ) : users.length === 0 ? (
        <Empty text="没找到这个人，换个关键词试试" />
      ) : (
        <Card className="p-0">
          {users.map((u) => (
            <div key={u.id} className="flex items-center gap-3 border-b border-border/50 px-4 py-3 last:border-0">
              <Avatar name={u.nickname} size={38} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-bold">{u.nickname}</div>
                <div className="text-[11px] text-ink-soft">@{u.username}</div>
              </div>
              {(u.rel === 'none' || u.rel === 'pending_in') && (
                <Btn size="sm" disabled={busyName === u.username} onClick={() => add(u)}>
                  {u.rel === 'pending_in' ? '同意' : '+ 申请'}
                </Btn>
              )}
              {u.rel === 'pending_out' && <span className="text-[11px] text-ink-soft">已申请 · 等对方处理</span>}
              {u.rel === 'friends' && <span className="text-[11px] font-bold text-good-deep">已是好友 ✓</span>}
            </div>
          ))}
        </Card>
      )}

      <div className="pb-2 text-center text-[11px] leading-relaxed text-ink-soft">
        两人互相申请会直接成为好友
        <br />
        收到的申请在「广场 → 好友」里处理
      </div>
    </div>
  );
}
