import type { Pledge } from '@/lib/types';
import { cnDate } from '@/lib/format';
import { useAuth } from '@/lib/store';
import { cn } from 'cn';

const TERMINAL: Record<string, { text: string; color: string }> = {
  abandoned: { text: '已弃', color: '#8a7561' },
  failed: { text: '已败', color: '#b3251a' },
  completed: { text: '达成', color: '#1f8f63' },
};

function SealStamp() {
  return (
    <div className="stamp-anim absolute right-3 -bottom-2 size-16 opacity-90 select-none pointer-events-none">
      <svg viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="46" fill="none" stroke="#c0271a" strokeWidth="5" />
        <circle cx="50" cy="50" r="36" fill="none" stroke="#c0271a" strokeWidth="1.5" />
        <path d="M50 22 L54 34 L67 34 L57 42 L61 54 L50 46 L39 54 L43 42 L33 34 L46 34 Z" fill="#c0271a" />
        <text x="50" y="72" textAnchor="middle" fontSize="13" fontWeight="bold" fill="#c0271a" letterSpacing="2">
          破釜为证
        </text>
      </svg>
    </div>
  );
}

/** 终局状态章：已弃 / 已败 / 达成，盖在状纸中央 */
function StatusStamp({ status }: { status: string }) {
  const t = TERMINAL[status];
  if (!t) return null;
  return (
    <div className="stamp-anim absolute inset-0 flex items-center justify-center select-none pointer-events-none">
      <div className="rotate-[-12deg] opacity-90">
        <svg width="130" height="130" viewBox="0 0 130 130">
          <circle cx="65" cy="65" r="58" fill="none" stroke={t.color} strokeWidth="6" strokeDasharray="12 7" />
          <circle cx="65" cy="65" r="47" fill="none" stroke={t.color} strokeWidth="2" />
          <text x="65" y="80" textAnchor="middle" fontSize="38" fontWeight="bold" fill={t.color} letterSpacing="4">
            {t.text}
          </text>
        </svg>
      </div>
    </div>
  );
}

/** 军令状：整个产品的灵魂组件 */
export function PledgeCard({ pledge, fresh }: { pledge: Pledge; fresh?: boolean }) {
  const { user } = useAuth();
  const dead = pledge.status !== 'active';
  const weeks = Math.max(1, Math.ceil((new Date(`${pledge.deadline}T00:00:00`).getTime() - new Date(`${pledge.start_date}T00:00:00`).getTime()) / 604800000));
  void fresh;

  return (
    <div className={cn('paper relative wob-lg p-5', dead && 'opacity-85 saturate-[.7]')}>
      <div className="flex items-start gap-5">
        <div className="paper-rule wob-sm flex h-24 w-9 items-center justify-center border-2 border-dashed py-2">
          <div className="text-lg font-bold tracking-[0.3em]" style={{ writingMode: 'vertical-rl' }}>
            军令状
          </div>
        </div>
        <div className="flex-1 text-[15px] leading-[2]">
          <p className="mb-1 font-bold">立状人：{user?.nickname || user?.username}</p>
          <p>
            本人自愿立下此状：自 <b>{cnDate(pledge.start_date)}</b> 起，至 <b>{cnDate(pledge.deadline)}</b>（共 {weeks} 周），
            体重由 <b className="tnum">{pledge.start_weight.toFixed(1)}kg</b> 减至{' '}
            <b className="tnum">{pledge.target_weight.toFixed(1)}kg</b>。
          </p>
          <p>
            每周须减 <b className="tnum">{pledge.weekly_pace}kg</b>，每周日结算。
            {pledge.stake_per_week > 0 ? (
              <>
                一周不成，自愿受罚{' '}
                <b className="tnum text-[#b3251a]">¥{Math.round(pledge.stake_per_week)}</b>
                {pledge.punishment_desc ? `（${pledge.punishment_desc}）` : null}。
              </>
            ) : (
              '本状未设罚金，以信誉为注。'
            )}
            每日晨起称重打卡，漏称三天，当周即败。
          </p>
          <p className="mt-1.5 font-semibold">空口无凭，立此为证。</p>
          <div className="mt-2 flex items-end justify-between pr-24">
            <span className="text-[12px] opacity-70">立状日期 {cnDate(pledge.start_date)}</span>
            <span className="text-[16px] font-bold italic">{user?.username}</span>
          </div>
        </div>
      </div>
      <SealStamp />
      <StatusStamp status={pledge.status} />
    </div>
  );
}
