import { useEffect, useMemo, useState } from 'react';
import { api, refreshToday } from '@/lib/api';
import { toast } from '@/lib/store';
import { Btn, Input, Segmented, Sheet } from './ui-kit';
import { VoiceInput } from './voice-input';
import type { Food, Exercise } from '@/lib/types';
import { MEAL_LABEL, kg } from '@/lib/format';

// ---------- 称重 ----------

export function WeighSheet({
  open,
  onClose,
  current,
}: {
  open: boolean;
  onClose: () => void;
  current: number | null;
}) {
  const [v, setV] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setV(current !== null ? String(current) : '');
      setNote('');
    }
  }, [open, current]);

  const num = parseFloat(v);

  async function submit() {
    if (!(num >= 25 && num <= 300)) return toast('体重数值不对', 'error');
    setBusy(true);
    try {
      const r = await api<{ weight: number; trend: number }>('/weigh', { weight_kg: num, note: note.trim() });
      refreshToday();
      toast(
        current !== null
          ? `已更新：实称 ${kg(r.weight)}kg · 趋势 ${kg(r.trend)}kg（趋势每天只追 10%，慢慢来）`
          : '打卡成功，火种 +1',
        'good',
      );
      onClose();
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="晨起称重">
      <div className="pb-2 text-center text-[12px] text-muted-foreground">
        早起、排空、空腹，穿同样少的衣服。秤放硬地板。
      </div>
      <div className="my-3 flex items-baseline justify-center gap-2">
        <input
          value={v}
          onChange={(e) => setV(e.target.value)}
          inputMode="decimal"
          autoFocus
          placeholder="0.0"
          className="tnum w-44 bg-transparent text-center text-6xl font-bold text-brand outline-none placeholder:text-muted-foreground/25"
        />
        <span className="text-xl text-muted-foreground">kg</span>
      </div>
      <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={60} placeholder="备注（选填）：昨夜吃了火锅…" className="mb-4 text-center" />
      <Btn size="lg" block disabled={busy} onClick={submit}>
        {busy ? '记录中…' : current !== null ? '更新今日体重' : '记下，算数'}
      </Btn>
    </Sheet>
  );
}

// ---------- 饮食 ----------

type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snack';
type Mode = 'lib' | 'ai' | 'custom';

interface ParsedItem {
  name: string;
  meal: Meal;
  qty: number;
  unit: string;
  calories: number;
}

export function FoodSheet({ open, onClose, date }: { open: boolean; onClose: () => void; date?: string }) {
  const [mode, setMode] = useState<Mode>('lib');
  const [q, setQ] = useState('');
  const [foods, setFoods] = useState<Food[]>([]);
  const [picked, setPicked] = useState<Food | null>(null);
  const [qty, setQty] = useState('100');
  const [meal, setMeal] = useState<Meal>('breakfast');
  const [custom, setCustom] = useState(false);
  const [cName, setCName] = useState('');
  const [cKcal, setCKcal] = useState('');
  const [busy, setBusy] = useState(false);

  // AI 模式状态
  const [aiText, setAiText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParsedItem[] | null>(null);

  useEffect(() => {
    if (!open) {
      setQ(''); setPicked(null); setMode('lib'); setCName(''); setCKcal(''); setQty('100');
      setAiText(''); setParsed(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open || mode !== 'lib') return;
    const t = setTimeout(() => {
      api<{ foods: Food[] }>(`/foods?q=${encodeURIComponent(q)}`).then((r) => setFoods(r.foods));
    }, 150);
    return () => clearTimeout(t);
  }, [q, open, mode]);

  const kcal = useMemo(() => {
    if (!picked) return 0;
    const n = parseFloat(qty) || 0;
    return picked.unit === 'g' ? Math.round((picked.kcal * n) / 100) : Math.round(picked.kcal * n);
  }, [picked, qty]);

  async function parse() {
    if (!aiText.trim()) return toast('先说说你吃了什么', 'error');
    setParsing(true);
    setParsed(null);
    try {
      const r = await api<{ items: ParsedItem[] }>('/diet/parse', { text: aiText.trim() });
      if (r.items.length === 0) toast('没认出吃的，换个说法或手动输入', 'error');
      setParsed(r.items);
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setParsing(false);
    }
  }

  async function saveParsedAll() {
    if (!parsed || parsed.length === 0) return;
    setBusy(true);
    try {
      for (const it of parsed) {
        await api('/diet', { date, meal: it.meal, name: it.name, qty: it.qty, unit: it.unit, calories: it.calories });
      }
      refreshToday();
      toast(`${parsed.length} 笔已入账`, 'good');
      onClose();
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    setBusy(true);
    try {
      if (custom) {
        const kcalN = parseFloat(cKcal);
        if (!cName.trim() || !(kcalN >= 0)) throw new Error('把名字和热量填上');
        await api('/diet', { date, meal, name: cName.trim(), qty: 1, unit: '份', calories: kcalN });
      } else {
        if (!picked) throw new Error('先选一个食物');
        await api('/diet', {
          date,
          meal,
          name: picked.name,
          qty: parseFloat(qty) || 1,
          unit: picked.unit === 'g' ? 'g' : picked.unit,
          calories: kcal,
        });
      }
      refreshToday();
      toast('记上了', 'good');
      onClose();
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  const parsedTotal = parsed?.reduce((s, i) => s + i.calories, 0) ?? 0;

  return (
    <Sheet open={open} onClose={onClose} title="记一笔吃的">
      <Segmented
        className="mb-3 w-full [&>button]:flex-1"
        value={mode}
        onChange={(m) => { setMode(m); setCustom(m === 'custom'); }}
        options={[
          { value: 'lib', label: '食物库' },
          { value: 'ai', label: 'AI 识别' },
          { value: 'custom', label: '手动' },
        ]}
      />

      <div className="mb-1.5 text-[12px] text-muted-foreground">记到哪一餐（AI 识别会按描述自动推断，选错可改）</div>
      <Segmented
        className="mb-3"
        value={meal}
        onChange={setMeal}
        options={(['breakfast', 'lunch', 'dinner', 'snack'] as const).map((m) => ({ value: m, label: MEAL_LABEL[m] }))}
      />
      {mode === 'ai' ? (
        <>
          <div className="mb-3">
            <VoiceInput
              label="说一说吃了什么"
              onText={(t) => setAiText((prev) => (prev ? prev + t : t))}
            />
          </div>
          <textarea
            value={aiText}
            onChange={(e) => setAiText(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="用大白话描述，如：中午吃了一碗牛肉面、一个卤蛋，喝了一杯无糖美式"
            className="w-full resize-none wob-sm border-2 border-ink bg-paper-2/50 p-3 text-[15px] leading-relaxed outline-none placeholder:text-ink-soft/60 focus:shadow-[3px_3px_0_0_#fa5f4a]"
          />
          <Btn size="lg" block className="mt-3" disabled={parsing || !aiText.trim()} onClick={parse}>
            {parsing ? 'AI 正在认…' : parsed ? '重新识别' : 'AI 识别'}
          </Btn>

          {parsed && parsed.length > 0 && (
            <>
              <div className="mt-4 overflow-hidden rounded-xl border border-border">
                {parsed.map((it, i) => (
                  <div key={i} className="flex items-center justify-between border-b border-border/50 px-3.5 py-2.5 last:border-0">
                    <div className="min-w-0">
                      <div className="truncate text-[14px]">{it.name}</div>
                      <div className="tnum mt-0.5 text-[11px] text-muted-foreground">
                        {MEAL_LABEL[it.meal]} · {it.qty} {it.unit}
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <span className="tnum text-[14px] font-bold">{it.calories}</span>
                      <button
                        className="text-[16px] leading-none text-muted-foreground/50"
                        onClick={() => setParsed(parsed.filter((_, j) => j !== i))}
                        aria-label="删除"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-2.5 flex items-center justify-between">
                <span className="text-[12px] text-muted-foreground">识别 {parsed.length} 项，热量为估算，可删掉不对的</span>
                <span className="tnum text-[15px] font-bold text-brand">{parsedTotal} kcal</span>
              </div>
              <Btn size="lg" block className="mt-3" disabled={busy} onClick={saveParsedAll}>
                {busy ? '入账中…' : '全部记上'}
              </Btn>
            </>
          )}
        </>
      ) : (
        <>
          {custom ? (
            <div className="space-y-2.5">
              <Input value={cName} onChange={(e) => setCName(e.target.value)} maxLength={30} placeholder="吃了什么，如：妈妈做的红烧肉" />
              <Input value={cKcal} onChange={(e) => setCKcal(e.target.value)} inputMode="numeric" placeholder="估算热量 kcal，如 500" />
            </div>
          ) : (
            <>
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索：鸡胸肉 / 米饭 / 奶茶…" className="mb-2" />
              <div className="max-h-52 overflow-y-auto rounded-xl border border-border">
                {foods.length === 0 && <div className="py-8 text-center text-[13px] text-muted-foreground">没找到，用「手动」或「AI 识别」</div>}
                {foods.map((f) => (
                  <button
                    key={f.name}
                    className={`flex w-full items-center justify-between px-3.5 py-2.5 text-left ${picked?.name === f.name ? 'bg-brand/10' : 'active:bg-secondary'}`}
                    onClick={() => {
                      setPicked(f);
                      setQty(f.unit === 'g' ? '100' : '1');
                    }}
                  >
                    <span className="text-[14px]">{f.name}</span>
                    <span className="tnum text-[12px] text-muted-foreground">
                      {f.kcal} kcal/{f.unit === 'g' ? '100g' : f.unit}
                    </span>
                  </button>
                ))}
              </div>
              {picked && (
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-[13px]">{picked.name}</span>
                  <Input
                    className="tnum h-10 w-24 text-center"
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    inputMode="decimal"
                  />
                  <span className="text-[13px] text-muted-foreground">{picked.unit === 'g' ? '克' : picked.unit}</span>
                  <span className="tnum ml-auto text-lg font-bold text-brand">{kcal} kcal</span>
                </div>
              )}
            </>
          )}
          <Btn size="lg" block className="mt-4" disabled={busy} onClick={submit}>
            {busy ? '记录中…' : '记上'}
          </Btn>
        </>
      )}
    </Sheet>
  );
}

// ---------- 运动 ----------

interface ParsedExercise {
  activity: string;
  minutes: number;
  calories: number;
}

export function ExerciseSheet({ open, onClose, date }: { open: boolean; onClose: () => void; date?: string }) {
  const [list, setList] = useState<Exercise[]>([]);
  const [mode, setMode] = useState<'lib' | 'ai'>('lib');
  const [picked, setPicked] = useState<string>('');
  const [minutes, setMinutes] = useState('30');
  const [busy, setBusy] = useState(false);
  // AI 模式
  const [aiText, setAiText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParsedExercise[] | null>(null);

  useEffect(() => {
    if (open) {
      api<{ exercises: Exercise[] }>('/exercises').then((r) => setList(r.exercises));
    } else {
      setPicked('');
      setMinutes('30');
      setMode('lib');
      setAiText('');
      setParsed(null);
    }
  }, [open]);

  const met = list.find((e) => e.name === picked)?.met || 0;
  const est = met ? Math.round((met * 3.5 * 70) / 200 * (parseFloat(minutes) || 0)) : 0;

  async function parse() {
    if (!aiText.trim()) return toast('先说说你动了什么', 'error');
    setParsing(true);
    setParsed(null);
    try {
      const r = await api<{ items: ParsedExercise[] }>('/exercise/parse', { text: aiText.trim() });
      if (r.items.length === 0) toast('没认出运动，换个说法或从列表选', 'error');
      setParsed(r.items);
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setParsing(false);
    }
  }

  async function submit() {
    if (!picked) return toast('先选运动', 'error');
    setBusy(true);
    try {
      await api('/exercise', { date, activity: picked, minutes: parseInt(minutes) || 1 });
      refreshToday();
      toast('运动入账，火种更旺', 'good');
      onClose();
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function saveParsedAll() {
    if (!parsed || parsed.length === 0) return;
    setBusy(true);
    try {
      for (const it of parsed) {
        await api('/exercise', { date, activity: it.activity, minutes: it.minutes });
      }
      refreshToday();
      toast(`${parsed.length} 笔运动已入账`, 'good');
      onClose();
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  const parsedTotal = parsed?.reduce((s, i) => s + i.calories, 0) ?? 0;

  return (
    <Sheet open={open} onClose={onClose} title="记一笔运动">
      <Segmented
        className="mb-3 w-full [&>button]:flex-1"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'lib', label: '列表选择' },
          { value: 'ai', label: '语音 / 文字' },
        ]}
      />

      {mode === 'ai' ? (
        <>
          <div className="mb-3">
            <VoiceInput
              label="说一说动了什么"
              onText={(t) => setAiText((prev) => (prev ? prev + t : t))}
            />
          </div>
          <textarea
            value={aiText}
            onChange={(e) => setAiText(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="如：跑了五公里大概三十五分钟，晚上又跳了二十分钟绳"
            className="w-full resize-none wob-sm border-2 border-ink bg-paper-2/50 p-3 text-[15px] leading-relaxed outline-none placeholder:text-ink-soft/60 focus:shadow-[3px_3px_0_0_#fa5f4a]"
          />
          <Btn size="lg" block className="mt-3" disabled={parsing || !aiText.trim()} onClick={parse}>
            {parsing ? 'AI 正在认…' : parsed ? '重新识别' : 'AI 识别'}
          </Btn>

          {parsed && parsed.length > 0 && (
            <>
              <div className="mt-4 overflow-hidden rounded-xl border border-border">
                {parsed.map((it, i) => (
                  <div key={i} className="flex items-center justify-between border-b border-border/50 px-3.5 py-2.5 last:border-0">
                    <div className="min-w-0">
                      <div className="truncate text-[14px]">{it.activity}</div>
                      <div className="tnum mt-0.5 text-[11px] text-muted-foreground">{it.minutes} 分钟</div>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <span className="tnum text-[14px] font-bold text-good">-{it.calories}</span>
                      <button
                        className="text-[16px] leading-none text-muted-foreground/50"
                        onClick={() => setParsed(parsed.filter((_, j) => j !== i))}
                        aria-label="删除"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-2.5 flex items-center justify-between">
                <span className="text-[12px] text-muted-foreground">识别 {parsed.length} 项，可删掉不对的</span>
                <span className="tnum text-[15px] font-bold text-good">-{parsedTotal} kcal</span>
              </div>
              <Btn size="lg" block className="mt-3" disabled={busy} onClick={saveParsedAll}>
                {busy ? '入账中…' : '全部记上'}
              </Btn>
            </>
          )}
        </>
      ) : (
        <>
          <div className="max-h-56 overflow-y-auto rounded-xl border border-border">
            {list.map((e) => (
              <button
                key={e.name}
                className={`flex w-full items-center justify-between px-3.5 py-2.5 text-left text-[14px] ${picked === e.name ? 'bg-brand/10' : 'active:bg-secondary'}`}
                onClick={() => setPicked(e.name)}
              >
                <span>{e.name}</span>
                <span className="tnum text-[12px] text-muted-foreground">MET {e.met}</span>
              </button>
            ))}
          </div>
          {picked && (
            <div className="mt-3 flex items-center gap-2">
              <Input
                className="tnum h-10 w-24 text-center"
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                inputMode="numeric"
              />
              <span className="text-[13px] text-muted-foreground">分钟</span>
              <span className="tnum ml-auto text-lg font-bold text-good">≈ {est} kcal</span>
            </div>
          )}
          <Btn size="lg" block className="mt-4" disabled={busy} onClick={submit}>
            {busy ? '记录中…' : '记上'}
          </Btn>
        </>
      )}
    </Sheet>
  );
}
