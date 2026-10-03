import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { Card, Avatar, CreditBadge, Empty, Segmented, StreakFlame } from '@/components/ui-kit';
import { EventCard } from '@/components/event-card';
import { FriendsPanel } from '@/components/friends-panel';
import type { FeedEvent, LeaderItem } from '@/lib/types';
import { useAuth } from '@/lib/store';

export default function SquarePage() {
  const [tab, setTab] = useState<'feed' | 'board' | 'friends'>('feed');
  return (
    <div className="space-y-3.5">
      <div className="pt-1 text-lg font-bold">广场</div>
      <Segmented
        className="w-full [&>button]:flex-1"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'feed', label: '动态' },
          { value: 'board', label: '排行榜' },
          { value: 'friends', label: '好友' },
        ]}
      />
      {tab === 'feed' ? <Feed /> : tab === 'board' ? <Board /> : <FriendsPanel />}
    </div>
  );
}

type Scope = 'all' | 'friends';

const PAGE = 50; // 后端每页固定 50 条

function Feed() {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [scope, setScope] = useState<Scope>('all');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [done, setDone] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // 切换范围：重置列表
  useEffect(() => {
    setLoading(true);
    setDone(false);
    api<{ events: FeedEvent[] }>(`/square?scope=${scope}`).then((r) => {
      setEvents(r.events);
      setDone(r.events.length < PAGE);
      setLoading(false);
    });
  }, [scope]);

  const loadMore = () => {
    if (loading || loadingMore || done || events.length === 0) return;
    setLoadingMore(true);
    api<{ events: FeedEvent[] }>(`/square?scope=${scope}&before=${events[events.length - 1].id}`)
      .then((r) => {
        setEvents((prev) => [...prev, ...r.events]);
        setDone(r.events.length < PAGE);
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  };

  // 触底自动加载：观察列表底部的哨兵元素
  useEffect(() => {
    const el = bottomRef.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => es[0].isIntersecting && loadMore(), {
      rootMargin: '300px',
    });
    io.observe(el);
    return () => io.disconnect();
  }, [events, loadingMore, done, scope]);

  const scopes: { v: Scope; label: string }[] = [
    { v: 'all', label: '全部' },
    { v: 'friends', label: '好友' },
  ];

  return (
    <>
      {/* 提示与筛选分行，小屏不换行 */}
      <div className="space-y-2">
        <div className="text-[12px] text-muted-foreground">所有用户的成败，都在这里</div>
        <div className="no-bar flex gap-1.5 overflow-x-auto">
          {scopes.map((s) => (
            <button
              key={s.v}
              className={`shrink-0 rounded-full border-2 px-3 py-1.5 text-[12px] font-bold press ${scope === s.v ? 'border-ink bg-brand/15 text-brand-deep ink-shadow-xs' : 'border-ink/30 bg-paper text-ink-soft'}`}
              onClick={() => setScope(s.v)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <Empty text="加载中…" />
      ) : events.length === 0 ? (
        <Empty text={scope === 'friends' ? '还没有好友动态，先去添加好友' : '还没有动态，去称个重'} />
      ) : (
        <>
          {events.map((e) => (
            <EventCard key={e.id} e={e} />
          ))}
          <div ref={bottomRef} className="py-3 text-center text-[12px] text-ink-soft">
            {loadingMore ? '正在加载…' : done ? '· 到底啦 ·' : '上滑加载更多'}
          </div>
        </>
      )}
    </>
  );
}

function Board() {
  const { user } = useAuth();
  const [items, setItems] = useState<LeaderItem[]>([]);
  const [myRank, setMyRank] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    api<{ items: LeaderItem[]; myRank: number; total: number }>('/leaderboard').then((r) => {
      setItems(r.items);
      setMyRank(r.myRank);
      setTotal(r.total);
      setLoading(false);
    });
  }, []);
  useEffect(load, [load]);

  if (loading) return <Empty text="加载中…" />;

  const medal = (i: number) => (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`);

  return (
    <>
      <Card className="flex items-center justify-between">
        <div className="text-[13px] text-muted-foreground">我的排名</div>
        <div className="flex items-center gap-2">
          <span className="tnum text-2xl font-bold text-brand">{myRank}</span>
          <span className="text-[12px] text-muted-foreground">/ {total}</span>
        </div>
      </Card>
      <Card className="p-0">
        {items.map((u, i) => (
          <div
            key={u.id}
            className={`flex items-center gap-3 border-b border-border/50 px-4 py-3 last:border-0 ${u.id === user?.id ? 'bg-brand/5' : ''}`}
          >
            <span className="tnum w-7 shrink-0 text-center text-[14px] font-bold text-muted-foreground">{medal(i)}</span>
            <Avatar name={u.nickname || u.username} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-bold">
                {u.nickname || u.username}
                {u.id === user?.id && <span className="ml-1.5 text-[10px] text-brand">我</span>}
              </div>
              <div className="mt-0.5 flex items-center gap-2.5 text-[11px] text-muted-foreground">
                <span>胜 {u.wins} 周</span>
                <StreakFlame n={u.streak} size="sm" />
              </div>
            </div>
            <CreditBadge v={u.credit} />
          </div>
        ))}
      </Card>
      <div className="pb-2 text-center text-[11px] leading-relaxed text-muted-foreground">
        只展示前 20 名 · 按信用分排，同分比连续打卡，再比胜周
        <br />
        排在 20 名之外时，会在末尾看到自己
      </div>
    </>
  );
}
