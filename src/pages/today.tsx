import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api, getToken } from '@/lib/api';
import { toast, useToday } from '@/lib/store';
import { Btn, Card, StreakFlame, CreditBadge, Logo, Empty } from '@/components/ui-kit';
import { CalorieRing } from '@/components/charts';
import { WeighSheet, FoodSheet, ExerciseSheet } from '@/components/sheets';
import { cnDate, weekdayCN, kg, signed } from '@/lib/format';

export default function TodayPage() {
  const { today } = useToday();
  const nav = useNavigate();
  const [weighOpen, setWeighOpen] = useState(false);
  const [foodOpen, setFoodOpen] = useState(false);
  const [exOpen, setExOpen] = useState(false);
  const [coach, setCoach] = useState<{ ai: boolean; text: string; tts?: boolean } | null>(null);
  const [speaking, setSpeaking] = useState(false);

  // 先显示规则文案，后台拉教练日报（配置了 AI 时走大模型，服务端有缓存）
  useEffect(() => {
    setCoach(null);
    if (!today) return;
    let alive = true;
    api<{ ai: boolean; text: string; tts?: boolean }>('/coach')
      .then((r) => alive && setCoach(r))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [today]);

  // 教练简报朗读（创始人配置了 TTS 才显示按钮）
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  async function speak() {
    const text = coach?.text;
    if (!text || speaking) return;
    if (audio) { audio.pause(); setAudio(null); return; }
    setSpeaking(true);
    try {
      const res = await fetch('/api/ai/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error || '语音合成失败');
      }
      const a = new Audio(URL.createObjectURL(await res.blob()));
      a.onended = () => { setAudio(null); setSpeaking(false); };
      a.onerror = () => { setAudio(null); setSpeaking(false); };
      setAudio(a);
      await a.play();
    } catch (e: any) {
      toast(e.message, 'error');
      setSpeaking(false);
    }
  }

  if (!today) return <Empty text="加载中…" />;

  const c = today.contract;
  const p = today.pledge;
  const cal = today.calorie;

  // 本周进度条: 从 start_trend 到 target
  let progress = 0;
  if (c && c.current_trend !== null) {
    const span = c.start_trend - c.target_weight;
    progress = span > 0 ? Math.min(1, Math.max(0, (c.start_trend - c.current_trend) / span)) : 1;
  }

  return (
    <div className="space-y-3.5 pb-4">
      {/* 头部 */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2">
          <Logo size={26} />
          <span className="text-[15px] font-bold">破釜</span>
        </div>
        <div className="flex items-center gap-3">
          <StreakFlame n={today.streak} />
          <CreditBadge v={today.credit} />
        </div>
      </div>

      {/* 军令状已终局 */}
      {!p && (
        <Card className="border-warn/30 bg-warn/5 text-center">
          <div className="text-[15px] font-bold">当前没有进行中的军令状</div>
          <div className="mt-1 mb-3 text-[12px] text-muted-foreground">上一张状已经归档，历史记录在「契约」页</div>
          <Btn onClick={() => nav('/onboarding')}>立一张新状</Btn>
        </Card>
      )}

      {/* 称重卡 */}
      <Card
        className={`relative overflow-hidden ${today.weighed ? '' : 'border-brand/40'}`}
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[12px] text-muted-foreground">
              {cnDate(today.date)} {weekdayCN(today.date)}
            </div>
            {today.weighed ? (
              <>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="tnum text-5xl font-bold">{kg(today.weight)}</span>
                  <span className="text-sm text-muted-foreground">kg 实称</span>
                </div>
                <div className="mt-1.5 flex items-center gap-2 text-[12px] text-muted-foreground">
                  <span className="tnum">趋势 {kg(today.trend)}kg</span>
                  {today.trendDelta !== null && (
                    <span className={`tnum rounded-full px-2 py-0.5 font-bold ${today.trendDelta <= 0 ? 'bg-good/15 text-good-deep' : 'bg-brand/15 text-brand-deep'}`}>
                      {signed(today.trendDelta)}
                    </span>
                  )}
                </div>
                {today.note && <div className="mt-1 text-[11px] text-muted-foreground/70">“{today.note}”</div>}
              </>
            ) : (
              <>
                <div className="mt-1 text-lg font-bold text-brand">今天还没上秤</div>
                <div className="mt-0.5 text-[12px] text-muted-foreground">秤不会说谎，人才会</div>
              </>
            )}
          </div>
          {today.streak > 0 && (
            <div className="flex flex-col items-center rounded-2xl bg-secondary/60 px-3 py-2">
              <StreakFlame n={today.streak} size="lg" />
              <span className="mt-1 text-[10px] text-muted-foreground">连续天数</span>
            </div>
          )}
        </div>
        <Btn
          block
          size="lg"
          className="mt-4"
          variant={today.weighed ? 'outline' : 'primary'}
          onClick={() => setWeighOpen(true)}
        >
          {today.weighed ? '更新今日体重' : '去称重打卡'}
        </Btn>
      </Card>

      {/* 热量卡 */}
      <Card>
        <div className="flex items-center gap-4">
          <CalorieRing intake={cal.intake} budget={cal.budget} burned={cal.burned} />
          <div className="min-w-0 flex-1 space-y-2">
            <Row label="摄入" value={`${cal.intake}`} unit="kcal" />
            <Row label="运动抵扣" value={`${cal.burned}`} unit="kcal" tone="good" />
            <Row label="每日预算" value={`${cal.budget}`} unit="kcal" sub={`TDEE ${cal.tdee}`} />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <Btn variant="outline" onClick={() => setFoodOpen(true)}>
            + 吃了
          </Btn>
          <Btn variant="outline" onClick={() => setExOpen(true)}>
            + 动了
          </Btn>
        </div>
      </Card>

      {/* 本周契约 */}
      {c && p && (
        <Card>
          <div className="flex items-baseline justify-between">
            <div className="text-[15px] font-bold">
              第 {c.week_no} 周契约
              <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">共 {today.totals?.total_weeks} 周</span>
            </div>
            <div className="tnum text-[12px] text-muted-foreground">剩 {c.days_left} 天</div>
          </div>
          <div className="mt-3 flex items-baseline justify-between text-[13px]">
            <span className="tnum">起点 {kg(c.start_trend)}kg</span>
            <span className="tnum text-brand">目标 {kg(c.target_weight)}kg</span>
          </div>
          <div className="relative mt-2 h-2.5 overflow-hidden rounded-full bg-secondary">
            <div
              className={`h-full rounded-full transition-all duration-700 ${progress >= 1 ? 'bg-good' : 'bg-brand'}`}
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          <div className="mt-2.5 text-[13px] leading-relaxed">
            {c.need === null ? (
              <span className="text-muted-foreground">上秤后开始计算进度</span>
            ) : c.need <= 0 ? (
              <span className="font-bold text-good">本周目标已达成 ✓ 周日结算前别飘</span>
            ) : (
              <span>
                还差 <b className="tnum text-brand">{kg(c.need)}kg</b>
                <span className="text-muted-foreground">（按趋势线算，周日晚结算）</span>
              </span>
            )}
          </div>
        </Card>
      )}

      {/* 教练 */}
      <Card className="border-l-2 border-l-brand/70">
        <div className="mb-1.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold tracking-widest text-brand">教练 · 今日一句</span>
            {coach && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${coach.ai ? 'bg-brand/15 text-brand' : 'bg-secondary text-muted-foreground'}`}
              >
                {coach.ai ? 'AI' : '规则'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {coach?.tts && coach.text && (
              <button
                type="button"
                onClick={speak}
                disabled={speaking && !audio}
                className="flex items-center gap-1 rounded-full border-2 border-ink bg-paper px-2 py-0.5 text-[11px] font-bold press"
                title="听教练说"
              >
                <span aria-hidden>{audio ? '⏸' : '🔊'}</span>
                {audio ? '停止' : speaking ? '合成中…' : '听'}
              </button>
            )}
          </div>
        </div>
        <div className="text-[14px] leading-relaxed">{coach?.text ?? today.coach}</div>
      </Card>

      {/* 罚金待缴 */}
      {today.pendingStakes > 0 && (
        <Link to="/contract">
          <Card className="flex items-center justify-between border-brand/50 bg-brand/10">
            <div>
              <div className="text-[15px] font-bold text-brand">罚金待缴 ¥{today.pendingStakes}</div>
              <div className="mt-0.5 text-[12px] text-muted-foreground">缴完之前，教练不跟你说话</div>
            </div>
            <Btn variant="danger" size="sm">
              去处理
            </Btn>
          </Card>
        </Link>
      )}

      {/* 总进度 */}
      {p && today.totals && (
        <Card className="flex items-center justify-around text-center">
          <div>
            <div className="tnum text-xl font-bold text-good">-{kg(today.totals.lost)}</div>
            <div className="mt-0.5 text-[10px] text-muted-foreground">已减 (kg)</div>
          </div>
          <div className="w-px bg-border" style={{ height: 28 }} />
          <div>
            <div className="tnum text-xl font-bold">{kg(today.totals.remaining_kg)}</div>
            <div className="mt-0.5 text-[10px] text-muted-foreground">距目标 (kg)</div>
          </div>
          <div className="w-px bg-border" style={{ height: 28 }} />
          <div>
            <div className="tnum text-xl font-bold">{today.totals.days_to_deadline}</div>
            <div className="mt-0.5 text-[10px] text-muted-foreground">距截止 (天)</div>
          </div>
        </Card>
      )}

      <WeighSheet open={weighOpen} onClose={() => setWeighOpen(false)} current={today.weight} />
      <FoodSheet open={foodOpen} onClose={() => setFoodOpen(false)} />
      <ExerciseSheet open={exOpen} onClose={() => setExOpen(false)} />
    </div>
  );
}

function Row({ label, value, unit, tone, sub }: { label: string; value: string; unit: string; tone?: string; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-[12px] text-muted-foreground">
        {label}
        {sub && <span className="ml-1 text-[10px] opacity-60">({sub})</span>}
      </span>
      <span className={`tnum text-[15px] font-bold ${tone === 'good' ? 'text-good' : ''}`}>
        {value}
        <span className="ml-0.5 text-[10px] font-normal text-muted-foreground">{unit}</span>
      </span>
    </div>
  );
}
