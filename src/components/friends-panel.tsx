import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '@/lib/api';
import { toast, useAuth } from '@/lib/store';
import { Avatar, Btn, Card, Empty, StreakFlame, CreditBadge } from './ui-kit';

interface FriendInfo {
  row_id: number;
  uid: number;
  username: string;
  nickname: string;
}
interface RequestInfo {
  id: number;
  username: string;
  nickname: string;
}
interface BoardItem {
  uid: number;
  username: string;
  nickname: string;
  isMe: boolean;
  weighed: boolean;
  streak: number;
  credit: number;
  exerciseMin: number;
  calorieOk: boolean | null;
  week: { week_no: number; state: 'ahead' | 'chasing' } | null;
}

export function FriendsPanel() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [friends, setFriends] = useState<FriendInfo[]>([]);
  const [requestsIn, setRequestsIn] = useState<RequestInfo[]>([]);
  const [requestsOut, setRequestsOut] = useState<RequestInfo[]>([]);
  const [board, setBoard] = useState<BoardItem[]>([]);

  const load = useCallback(() => {
    api<{ friends: FriendInfo[]; requestsIn: RequestInfo[]; requestsOut: RequestInfo[] }>('/friends').then((r) => {
      setFriends(r.friends);
      setRequestsIn(r.requestsIn);
      setRequestsOut(r.requestsOut);
    });
    api<{ items: BoardItem[] }>('/friends/board').then((r) => setBoard(r.items));
  }, []);
  useEffect(load, [load]);

  async function act(id: number, action: 'accept' | 'decline') {
    try {
      await api(`/friends/${id}/${action}`, {});
      toast(action === 'accept' ? '已成为好友，开始互相监督' : '已拒绝', action === 'accept' ? 'good' : 'info');
      load();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  }

  async function remove(rowId: number) {
    try {
      await api(`/friends/${rowId}`, { method: 'DELETE' });
      toast('已删除好友', 'info');
      load();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  }

  return (
    <div className="space-y-3.5">
      {/* 添加好友：独立入口 */}
      <Btn block size="lg" variant="outline" onClick={() => nav('/friends/add')}>
        🔍 搜索并添加好友
      </Btn>
      {requestsOut.length > 0 && (
        <div className="-mt-1.5 text-center text-[11px] text-ink-soft">
          待对方处理：{requestsOut.map((r) => r.nickname || r.username).join('、')}
        </div>
      )}

      {/* 收到的申请 */}
      {requestsIn.length > 0 && (
        <Card className="border-warn/30">
          <div className="mb-2 text-[13px] font-bold text-warn">好友申请（{requestsIn.length}）</div>
          {requestsIn.map((r) => (
            <div key={r.id} className="flex items-center justify-between border-b border-border/50 py-2 last:border-0">
              <div className="text-[13px]">
                {r.nickname || r.username}
                <span className="ml-1.5 text-[11px] text-muted-foreground">@{r.username}</span>
              </div>
              <div className="flex gap-2">
                <Btn size="sm" onClick={() => act(r.id, 'accept')}>
                  同意
                </Btn>
                <Btn size="sm" variant="ghost" onClick={() => act(r.id, 'decline')}>
                  拒绝
                </Btn>
              </div>
            </div>
          ))}
        </Card>
      )}

      {/* 每日攀比榜 */}
      <Card className="p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <span className="text-[13px] font-bold">今日攀比</span>
          <span className="text-[11px] text-muted-foreground">体重等隐私互不可见</span>
        </div>
        {board.map((it, i) => (
          <div
            key={it.uid}
            className={`flex items-center gap-3 border-b border-border/50 px-4 py-3 last:border-0 ${it.isMe ? 'bg-brand/5' : ''}`}
          >
            <span className="tnum w-5 shrink-0 text-center text-[13px] font-bold text-muted-foreground">{i + 1}</span>
            <Avatar name={it.nickname} size={32} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-bold">
                {it.nickname}
                {it.isMe && <span className="ml-1.5 text-[10px] text-brand">我</span>}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                <span className={it.weighed ? 'text-good-deep' : 'text-brand-deep'}>
                  {it.weighed ? '✓ 已打卡' : '✗ 未称重'}
                </span>
                <StreakFlame n={it.streak} size="sm" />
                {it.exerciseMin > 0 && (
                  <span className="tnum text-ink-soft">运动 {it.exerciseMin}′</span>
                )}
                {it.calorieOk !== null && (
                  <span className={it.calorieOk ? 'text-good-deep' : 'text-brand-deep'}>
                    {it.calorieOk ? '热量✓' : '超支✗'}
                  </span>
                )}
                {it.week && (
                  <span className={it.week.state === 'ahead' ? 'text-good-deep' : 'text-ink-soft'}>
                    第{it.week.week_no}周{it.week.state === 'ahead' ? '·已达标' : '·追赶中'}
                  </span>
                )}
              </div>
            </div>
            <CreditBadge v={it.credit} />
          </div>
        ))}
        {board.length <= 1 && friends.length === 0 && (
          <Empty icon="🤝" text="还没有好友，加上一个，每天攀比着瘦" />
        )}
      </Card>

      {/* 好友列表 */}
      {friends.length > 0 && (
        <Card className="p-0">
          <div className="border-b border-border px-4 py-2.5 text-[13px] font-bold">好友（{friends.length}）</div>
          {friends.map((f) => (
            <div key={f.row_id} className="flex items-center justify-between border-b border-border/50 px-4 py-2.5 last:border-0">
              <div className="text-[13px]">
                {f.nickname}
                <span className="ml-1.5 text-[11px] text-muted-foreground">@{f.username}</span>
              </div>
              <button className="text-[11px] text-muted-foreground" onClick={() => remove(f.row_id)}>
                删除
              </button>
            </div>
          ))}
        </Card>
      )}

      {user && friends.length === 0 && (
        <div className="pb-2 text-center text-[11px] text-muted-foreground">
          把你的用户名 <b>@{user.username}</b> 发给朋友，让对方也加你
        </div>
      )}
    </div>
  );
}
