import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '@/lib/api';
import { toast, useAuth } from '@/lib/store';
import { Btn, Input, Field, Logo, HoldButton, Segmented } from '@/components/ui-kit';
import { PledgeCard } from '@/components/pledge-card';
import { addDays, todayStr } from '@/lib/format';
import type { Pledge } from '@/lib/types';

const PACES = [
  { v: 0.25, label: '0.25' },
  { v: 0.5, label: '0.5' },
  { v: 0.75, label: '0.75' },
  { v: 1.0, label: '1.0' },
  { v: 1.25, label: '1.25' },
  { v: 1.5, label: '1.5' },
];

const ACTIVITIES = [
  { v: 1.2, label: '久坐' },
  { v: 1.375, label: '轻度' },
  { v: 1.55, label: '中度' },
  { v: 1.725, label: '高强度' },
];

const STAKES = [0, 50, 100, 200, 500];

export default function OnboardingPage() {
  const { user, reload } = useAuth();
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);

  const [gender, setGender] = useState<'male' | 'female'>(user?.gender === 'female' ? 'female' : 'male');
  const [birthYear, setBirthYear] = useState(String(user?.birth_year || 1995));
  const [height, setHeight] = useState(String(user?.height_cm || 170));
  const [activity, setActivity] = useState(user?.activity || 1.375);

  const [weight, setWeight] = useState('');
  const [target, setTarget] = useState('');
  const [pace, setPace] = useState(0.5);
  const [deadline, setDeadline] = useState('');
  // 记录用户最后操作的是配速还是日期，另一个随之反推
  const [driver, setDriver] = useState<'pace' | 'date'>('pace');

  const [stake, setStake] = useState(100);
  const [stakeCustom, setStakeCustom] = useState(false);
  const [stakeText, setStakeText] = useState('');
  const [punish, setPunish] = useState('');

  const w = parseFloat(weight) || 0;
  const t = parseFloat(target) || 0;
  const loss = w > 0 && t > 0 && t < w ? w - t : 0;

  const suggestedDeadline = useMemo(() => {
    if (loss > 0 && pace > 0) {
      const weeks = Math.ceil(loss / pace);
      return addDays(todayStr(), Math.min(365, Math.max(7, weeks * 7)));
    }
    return addDays(todayStr(), 90);
  }, [loss, pace]);

  const effDeadline = deadline || suggestedDeadline;
  const weeksLeft = Math.max(1, Math.ceil((new Date(`${effDeadline}T00:00:00`).getTime() - Date.now()) / 604800000));

  // 配速 → 截止日期
  const dateFromPace = (p: number) => {
    if (!loss || p <= 0) return '';
    const weeks = Math.ceil(loss / p);
    return addDays(todayStr(), Math.min(365, Math.max(7, weeks * 7)));
  };
  // 截止日期 → 配速（0.25 步进，夹在 [0.25, 1.5]）
  const paceFromDate = (d: string) => {
    if (!loss || !d) return null;
    const days = Math.max(7, Math.round((new Date(`${d}T00:00:00`).getTime() - new Date(`${todayStr()}T00:00:00`).getTime()) / 86400000));
    const raw = (loss / days) * 7;
    return Math.min(1.5, Math.max(0.25, Math.round(raw * 4) / 4));
  };

  function pickPace(p: number) {
    setPace(p);
    setDriver('pace');
    const d = dateFromPace(p);
    if (d) setDeadline(d);
  }

  function pickDeadline(d: string) {
    setDeadline(d);
    if (!d) return;
    setDriver('date');
    const p = paceFromDate(d);
    if (p) setPace(p);
  }

  // 体重/目标变化后，按最后操作的一方联动另一方
  useEffect(() => {
    if (!loss) return;
    if (driver === 'pace') {
      const d = dateFromPace(pace);
      if (d) setDeadline(d);
    } else {
      const p = paceFromDate(deadline);
      if (p) setPace(p);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w, t]);

  const previewPledge: Pledge = {
    id: 0,
    start_weight: w,
    start_date: todayStr(),
    target_weight: t,
    deadline: effDeadline,
    weekly_pace: pace,
    stake_per_week: stake,
    punishment_desc: punish,
    status: 'active',
    created_at: new Date().toISOString(),
  };

  const step1Ok = birthYear && parseFloat(height) >= 100 && parseFloat(height) <= 230;
  const step2Ok = w >= 30 && w <= 300 && t >= 30 && t <= 250 && t < w && w - t <= 60;

  async function sign() {
    if (busy) return;
    setBusy(true);
    try {
      await api('/profile', {
        method: 'PUT',
        body: { gender, birth_year: parseInt(birthYear), height_cm: parseFloat(height), activity },
      });
      await api('/weigh', { weight_kg: w, note: '立状晨重' });
      await api('/pledge', {
        target_weight: t,
        deadline: effDeadline,
        weekly_pace: pace,
        stake_per_week: stake,
        punishment_desc: punish.trim(),
      });
      await reload();
      toast('军令状已立。从今天起，没有退路。', 'good');
      nav('/', { replace: true });
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-svh flex-col px-6 pt-safe pb-safe">
      {/* 顶部 */}
      <div className="flex items-center justify-between py-4">
        <div className="flex items-center gap-2.5">
          <Logo size={34} />
          <span className="font-bold">入营立状</span>
        </div>
        <div className="flex gap-1.5">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${i === step ? 'w-6 bg-brand' : i < step ? 'w-1.5 bg-brand/50' : 'w-1.5 bg-border'}`}
            />
          ))}
        </div>
      </div>

      <div className="flex-1">
        {step === 0 && (
          <div className="space-y-5 animate-in fade-in slide-in-from-right-2">
            <h2 className="text-xl font-bold">先报家门</h2>
            <p className="-mt-3 text-[13px] text-muted-foreground">用于计算你的每日热量预算，只此而已</p>
            <Field label="性别">
              <Segmented
                value={gender}
                onChange={setGender}
                options={[
                  { value: 'male', label: '男' },
                  { value: 'female', label: '女' },
                ]}
              />
            </Field>
            <Field label="出生年份">
              <Input
                value={birthYear}
                onChange={(e) => setBirthYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
                inputMode="numeric"
                placeholder="如 1995"
              />
            </Field>
            <Field label="身高 (cm)">
              <Input
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                inputMode="decimal"
                placeholder="如 172"
              />
            </Field>
            <Field label="日常活动量">
              <Segmented value={activity} onChange={setActivity} options={ACTIVITIES.map((a) => ({ value: a.v, label: a.label }))} />
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5 animate-in fade-in slide-in-from-right-2">
            <h2 className="text-xl font-bold">现状与目标</h2>
            <div className="wob border-2 border-ink bg-paper p-4">
              <div className="mb-1 text-[13px] font-medium text-ink">今晨空腹体重 (kg)</div>
              <input
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                inputMode="decimal"
                placeholder="0.0"
                className="tnum w-full bg-transparent text-5xl font-bold text-brand outline-none placeholder:text-ink-soft/30"
              />
            </div>
            <Field label="目标体重 (kg)" hint={`共减 ${(w && t && t < w ? w - t : 0).toFixed(1)}kg`}>
              <Input value={target} onChange={(e) => setTarget(e.target.value)} inputMode="decimal" placeholder={`建议 ${w ? (w - Math.min(w * 0.1, 10)).toFixed(1) : '--'}`} />
            </Field>
            <Field label="每周配速 (kg/周)">
              <div className="flex flex-wrap gap-2">
                {PACES.map((p) => (
                  <button
                    key={p.v}
                    onClick={() => pickPace(p.v)}
                    className={`tnum h-11 w-14 border-2 text-sm font-bold press ${pace === p.v ? 'wob-sm border-ink bg-brand/15 text-brand-deep ink-shadow-xs' : 'wob-sm border-ink/30 bg-paper text-ink-soft'}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </Field>
            {pace > 1.0 && (
              <div className="rounded-xl bg-warn/10 p-3 text-[12px] leading-relaxed text-warn">
                每周超过 1kg 属于激进减重，掉肌肉、易反弹。破釜允许，但后果自负。
              </div>
            )}
            <Field label="截止日期" hint={`约 ${weeksLeft} 周`}>
              <Input type="date" value={deadline} min={addDays(todayStr(), 7)} max={addDays(todayStr(), 365)} onChange={(e) => pickDeadline(e.target.value)} />
              <div className="mt-2 flex gap-2">
                {[30, 60, 90, 180].map((d) => (
                  <button
                    key={d}
                    onClick={() => pickDeadline(addDays(todayStr(), d))}
                    className="rounded-full bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground"
                  >
                    {d} 天
                  </button>
                ))}
              </div>
            </Field>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5 animate-in fade-in slide-in-from-right-2">
            <h2 className="text-xl font-bold">立罚则</h2>
            <p className="-mt-3 text-[13px] leading-relaxed text-muted-foreground">
              没有罚金的承诺是空头支票。每周契约失败，罚金自动入账，你必须亲手标记「已缴」或「赖账」——赖账会被公开。
            </p>
            <Field label="每周失败罚金 (¥)">
              <div className="flex flex-wrap gap-2">
                {STAKES.map((s) => (
                  <button
                    key={s}
                    onClick={() => { setStake(s); setStakeCustom(false); }}
                    className={`tnum h-11 border-2 px-4 text-sm font-bold press ${stake === s && !stakeCustom ? 'wob-sm border-ink bg-brand/15 text-brand-deep ink-shadow-xs' : 'wob-sm border-ink/30 bg-paper text-ink-soft'}`}
                  >
                    {s === 0 ? '不设罚金' : `¥${s}`}
                  </button>
                ))}
                <button
                  onClick={() => { setStakeCustom(true); setStakeText(!STAKES.includes(stake) && stake > 0 ? String(stake) : ''); }}
                  className={`tnum h-11 border-2 px-4 text-sm font-bold press ${stakeCustom ? 'wob-sm border-ink bg-brand/15 text-brand-deep ink-shadow-xs' : 'wob-sm border-ink/30 bg-paper text-ink-soft'}`}
                >
                  ✎ 自定义
                </button>
              </div>
              {stakeCustom && (
                <div className="mt-2.5">
                  <Input
                    value={stakeText}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, '').slice(0, 6);
                      setStakeText(v);
                      setStake(v ? Math.min(parseInt(v, 10), 100000) : 0);
                    }}
                    inputMode="numeric"
                    placeholder="1 ~ 100000"
                    className="tnum"
                    autoFocus
                  />
                  {!stakeText && <div className="mt-1.5 text-[12px] text-warn">填个金额才有罚金，空着等于不设。</div>}
                </div>
              )}
              {stake === 0 && !stakeCustom && (
                <div className="mt-2 text-[12px] text-warn">不设罚金 = 约束力为零，不推荐。</div>
              )}
            </Field>
            {stake > 0 && (
              <Field label="罚金去向" hint="写给自己">
                <Input value={punish} onChange={(e) => setPunish(e.target.value)} maxLength={100} placeholder="如：捐给公益基金 / 转给我最烦的人" />
              </Field>
            )}
            <p className="text-[12px] leading-relaxed text-ink-soft">
              想让人盯着你？立完状去「广场 → 好友」加好友，你的成败好友动态里优先可见。
            </p>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5 animate-in fade-in">
            <h2 className="text-xl font-bold">过目，然后签字</h2>
            <p className="-mt-3 text-[13px] leading-relaxed text-muted-foreground">
              这张状会跟着你整个减重期。达成，它是勋章；失守，它是罪证。
            </p>
            <PledgeCard pledge={previewPledge} />
            <div className="rounded-2xl border border-border bg-card p-4 text-[13px] leading-relaxed text-muted-foreground">
              <div className="mb-2 font-bold text-foreground">规矩三章：</div>
              <div>① 每天晨起称重打卡，历史不可改；</div>
              <div>② 每周日晚结算，差 0.1kg 也算失败；</div>
              <div>③ 罚金不缴清，教练拒绝对话。</div>
            </div>
            <HoldButton onDone={sign}>按住 2 秒 · 签字立状</HoldButton>
            {busy && <div className="text-center text-xs text-muted-foreground">正在盖章…</div>}
          </div>
        )}
      </div>

      {/* 底部按钮 */}
      {step < 3 && (
        <div className="flex gap-2.5 py-4">
          {step > 0 && (
            <Btn variant="outline" size="lg" className="shrink-0 whitespace-nowrap" onClick={() => setStep(step - 1)}>
              上一步
            </Btn>
          )}
          <Btn
            size="lg"
            block
            disabled={(step === 0 && !step1Ok) || (step === 1 && !step2Ok)}
            onClick={() => setStep(step + 1)}
          >
            {step === 1 ? '定罚则' : '下一步'}
          </Btn>
        </div>
      )}
      {step === 3 && (
        <div className="py-4 text-center">
          <button className="text-[13px] text-muted-foreground" onClick={() => setStep(2)}>
            回去改罚则
          </button>
        </div>
      )}
    </div>
  );
}
