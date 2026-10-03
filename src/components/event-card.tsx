import type { FeedEvent } from '@/lib/types';
import { timeAgo, kg } from '@/lib/format';
import { Avatar } from './ui-kit';

const META: Record<string, { icon: string; bg: string }> = {
  checkin: { icon: '⚖️', bg: 'bg-secondary' },
  diet: { icon: '🍜', bg: 'bg-warn/15' },
  exercise: { icon: '🏃', bg: 'bg-good/15' },
  contract_success: { icon: '🏆', bg: 'bg-good/15' },
  contract_fail: { icon: '💔', bg: 'bg-brand/15' },
  stake_paid: { icon: '💸', bg: 'bg-good/10' },
  stake_denied: { icon: '🚫', bg: 'bg-brand/20' },
  pledge_created: { icon: '📜', bg: 'bg-warn/15' },
  pledge_completed: { icon: '👑', bg: 'bg-good/20' },
  pledge_failed: { icon: '⚔️', bg: 'bg-brand/15' },
  pledge_abandoned: { icon: '🏳️', bg: 'bg-secondary' },
  friendship: { icon: '🤝', bg: 'bg-good/10' },
  milestone: { icon: '🗿', bg: 'bg-warn/20' },
};

function fmtDelta(d: number): string {
  return `${d > 0 ? '+' : ''}${d.toFixed(1)}kg`;
}

function body(e: FeedEvent): { main: string; sub?: string } {
  const p = e.payload;
  switch (e.type) {
    case 'checkin':
      return {
        main: p.delta == null ? '完成晨称打卡' : `晨称 · 较上次 ${fmtDelta(p.delta)}`,
        sub: `连续打卡 ${p.streak} 天`,
      };
    case 'diet':
      return { main: `今日饮食 ${p.n} 笔 · ${p.kcal} kcal`, sub: '吃进去的都记着呢' };
    case 'exercise':
      return { main: `今日运动 ${p.n} 笔 · ${p.min} 分钟`, sub: `消耗约 ${p.kcal} kcal` };
    case 'contract_success':
      return { main: `第 ${p.week_no} 周契约达成`, sub: `本周趋势 -${kg(p.delta)}kg，说到做到` };
    case 'contract_fail':
      return {
        main: `第 ${p.week_no} 周契约失守`,
        sub: p.need !== null && p.need !== undefined ? `差 ${kg(p.need)}kg 没到位` + (p.amount ? `，罚金 ¥${Math.round(p.amount)} 入账` : '') : `漏称太多，按失败结算${p.amount ? `，罚金 ¥${Math.round(p.amount)} 入账` : ''}`,
      };
    case 'stake_paid':
      return { main: `缴纳罚金 ¥${Math.round(p.amount)}`, sub: '认赌服输，信用 +5' };
    case 'stake_denied':
      return { main: `对 ¥${Math.round(p.amount)} 罚金赖账了`, sub: '公开记录，信用 -50' };
    case 'pledge_created':
      return { main: `立下军令状：减到 ${kg(p.target_weight)}kg`, sub: `${p.weeks} 周，每周失败罚 ¥${Math.round(p.stake_per_week || 0)}` };
    case 'pledge_completed':
      return { main: `军令状达成！`, sub: `累计减掉 ${kg(p.total_lost)}kg，说到做到` };
    case 'pledge_failed':
      return { main: `军令状到期未成`, sub: p.remaining !== null && p.remaining !== undefined ? `还差 ${kg(p.remaining)}kg，败得很清楚` : '败在没上秤' };
    case 'pledge_abandoned':
      return { main: `当了逃兵，弃状而去`, sub: '信用 -30，公开记录' };
    case 'milestone':
      return { main: `里程碑：累计减掉 ${kg(p.total_lost)}kg`, sub: '每 -5kg 立一块碑' };
    case 'friendship':
      return { main: `与 ${p.with} 结为好友`, sub: '从今天起互相监督' };
    default:
      return { main: e.type };
  }
}

export function EventCard({ e }: { e: FeedEvent }) {
  const meta = META[e.type] || { icon: '·', bg: 'bg-secondary' };
  const { main, sub } = body(e);
  return (
    <div className={`wob flex items-start gap-3 border-2 border-ink p-3.5 ink-shadow-xs ${meta.bg}`}>
      <Avatar name={e.user.nickname || e.user.username} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-bold">{e.user.nickname || e.user.username}</span>
          <span className="shrink-0 text-[10px] text-ink-soft">{timeAgo(e.created_at)}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[14px] leading-snug">
          <span>{meta.icon}</span>
          <span className="font-medium">{main}</span>
        </div>
        {sub && <div className="mt-0.5 text-[12px] text-ink-soft">{sub}</div>}
      </div>
    </div>
  );
}
