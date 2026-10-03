import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useToday } from '@/lib/store';
import { Card, Empty, Segmented } from '@/components/ui-kit';
import { WeightChart } from '@/components/charts';
import { FoodSheet, ExerciseSheet } from '@/components/sheets';
import type { DietLog, ExerciseLog, WeightPoint } from '@/lib/types';
import { MEAL_LABEL, cnDate, weekdayCN, kg, signed, addDays, todayStr } from '@/lib/format';

type Tab = 'weight' | 'diet' | 'exercise';

export default function LogPage() {
  const [tab, setTab] = useState<Tab>('weight');
  return (
    <div className="space-y-3.5">
      <div className="pt-1 text-lg font-bold">记录</div>
      <Segmented
        className="w-full [&>button]:flex-1"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'weight', label: '体重' },
          { value: 'diet', label: '饮食' },
          { value: 'exercise', label: '运动' },
        ]}
      />
      {tab === 'weight' && <WeightTab />}
      {tab === 'diet' && <DietTab />}
      {tab === 'exercise' && <ExerciseTab />}
    </div>
  );
}

// ---------- 体重 ----------

const PAGE_SIZE = 15;

function WeightTab() {
  const { today } = useToday();
  const [range, setRange] = useState('30');
  const [points, setPoints] = useState<WeightPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    api<{ points: WeightPoint[] }>(`/weights?days=${range}`).then((r) => {
      setPoints(r.points);
      setLoading(false);
    });
  }, [range, today?.weighed]);

  // 切换时间范围时回到第一页
  useEffect(() => setPage(1), [range]);

  const stats = (() => {
    if (points.length === 0) return null;
    const ws = points.map((p) => p.weight);
    const first = points[0].trend;
    const last = points[points.length - 1].trend;
    return {
      min: Math.min(...ws),
      max: Math.max(...ws),
      delta: last - first,
      days: points.length,
    };
  })();

  return (
    <>
      <div className="flex items-center justify-between">
        <Segmented
          value={range}
          onChange={setRange}
          options={[
            { value: '7', label: '7天' },
            { value: '30', label: '30天' },
            { value: '90', label: '90天' },
          ]}
        />
        {stats && (
          <span className="tnum text-[12px] text-muted-foreground">
            趋势 <b className={stats.delta <= 0 ? 'text-good' : 'text-brand'}>{signed(stats.delta)}kg</b>
          </span>
        )}
      </div>
      <Card>
        {loading ? <Empty text="加载中…" /> : <WeightChart points={points} target={today?.pledge?.target_weight ?? null} />}
      </Card>
      {stats && (
        <Card className="grid grid-cols-4 text-center">
          <Stat v={kg(stats.min)} l="最低" />
          <Stat v={kg(stats.max)} l="最高" />
          <Stat v={String(stats.days)} l="打卡天" />
          <Stat v={signed(stats.delta)} l="趋势变化" tone={stats.delta <= 0 ? 'good' : 'brand'} />
        </Card>
      )}
      <Card className="p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <span className="text-[13px] font-bold">称重历史（不可篡改）</span>
          {points.length > 0 && (
            <span className="tnum text-[11px] text-muted-foreground">共 {points.length} 条</span>
          )}
        </div>
        {[...points].reverse().slice(0, page * PAGE_SIZE).map((p) => (
          <div key={p.date} className="flex items-center justify-between border-b border-border/50 px-4 py-2.5 last:border-0">
            <div>
              <div className="text-[13px]">
                {cnDate(p.date)} <span className="text-muted-foreground">{weekdayCN(p.date)}</span>
              </div>
              <div className="tnum mt-0.5 text-[11px] text-muted-foreground">趋势 {kg(p.trend)}kg</div>
            </div>
            <div className="tnum text-[15px] font-bold">{kg(p.weight)}kg</div>
          </div>
        ))}
        {points.length === 0 && !loading && <Empty text="还没有记录" />}
        {points.length > page * PAGE_SIZE && (
          <button
            className="w-full border-t-2 border-dashed border-ink/20 py-3 text-[13px] font-bold text-brand-deep active:bg-cream"
            onClick={() => setPage((n) => n + 1)}
          >
            加载更多 · 还剩 {points.length - page * PAGE_SIZE} 条
          </button>
        )}
        {points.length > PAGE_SIZE && points.length <= page * PAGE_SIZE && (
          <div className="border-t-2 border-dashed border-ink/20 py-3 text-center text-[11px] text-ink-soft">
            已显示全部 {points.length} 条
          </div>
        )}
      </Card>
    </>
  );
}

function Stat({ v, l, tone }: { v: string; l: string; tone?: string }) {
  return (
    <div className="py-1">
      <div className={`tnum text-[15px] font-bold ${tone === 'good' ? 'text-good' : tone === 'brand' ? 'text-brand' : ''}`}>{v}</div>
      <div className="mt-0.5 text-[10px] text-muted-foreground">{l}</div>
    </div>
  );
}

// ---------- 日选择器 ----------

function DayNav({ date, setDate }: { date: string; setDate: (d: string) => void }) {
  const isToday = date === todayStr();
  return (
    <div className="flex items-center justify-between">
      <button className="rounded-full p-2 text-muted-foreground disabled:opacity-30" disabled={date <= '2020-01-01'} onClick={() => setDate(addDays(date, -1))}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M15 5l-7 7 7 7" />
        </svg>
      </button>
      <div className="text-[15px] font-bold">
        {date === todayStr() ? '今天' : cnDate(date)} <span className="text-[12px] font-normal text-muted-foreground">{weekdayCN(date)}</span>
      </div>
      <button className="rounded-full p-2 text-muted-foreground disabled:opacity-30" disabled={isToday} onClick={() => setDate(addDays(date, 1))}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );
}

// ---------- 饮食 ----------

function DietTab() {
  const [date, setDate] = useState(todayStr());
  const [diet, setDiet] = useState<DietLog[]>([]);
  const [open, setOpen] = useState(false);
  const [tick, setTick] = useState(0);

  const load = useCallback(() => {
    api<{ diet: DietLog[] }>(`/logs?date=${date}`).then((r) => setDiet(r.diet));
  }, [date]);
  useEffect(load, [load, tick]);

  const total = diet.reduce((s, d) => s + d.calories, 0);
  const groups = (['breakfast', 'lunch', 'dinner', 'snack'] as const)
    .map((m) => ({ meal: m, items: diet.filter((d) => d.meal === m) }))
    .filter((g) => g.items.length > 0);

  return (
    <>
      <DayNav date={date} setDate={setDate} />
      <Card className="flex items-center justify-between">
        <div className="text-[13px] text-muted-foreground">当日摄入</div>
        <div className="tnum text-2xl font-bold">
          {Math.round(total)} <span className="text-xs font-normal text-muted-foreground">kcal</span>
        </div>
      </Card>
      {groups.map((g) => (
        <Card key={g.meal} className="p-0">
          <div className="border-b border-border px-4 py-2.5 text-[13px] font-bold">
            {MEAL_LABEL[g.meal]}
            <span className="tnum ml-2 text-[11px] font-normal text-muted-foreground">
              {Math.round(g.items.reduce((s, i) => s + i.calories, 0))} kcal
            </span>
          </div>
          {g.items.map((d) => (
            <div key={d.id} className="flex items-center justify-between border-b border-border/50 px-4 py-2.5 last:border-0">
              <div className="min-w-0">
                <div className="truncate text-[14px]">{d.name}</div>
                <div className="tnum mt-0.5 text-[11px] text-muted-foreground">
                  {d.qty} {d.unit}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="tnum text-[14px] font-bold">{Math.round(d.calories)}</span>
                <button
                  className="text-[16px] leading-none text-muted-foreground/50"
                  onClick={() => api(`/diet/${d.id}`, { method: 'DELETE' }).then(() => setTick((t) => t + 1))}
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </Card>
      ))}
      {groups.length === 0 && <Empty icon="🍜" text="这一天没记吃的" />}
      <button
        className="wob fixed right-5 bottom-28 z-30 flex size-14 items-center justify-center border-2 border-ink bg-brand text-2xl font-light text-white ink-shadow press"
        onClick={() => setOpen(true)}
        aria-label="添加食物"
      >
        +
      </button>
      <FoodSheet open={open} onClose={() => { setOpen(false); setTick((t) => t + 1); }} date={date} />
    </>
  );
}

// ---------- 运动 ----------

function ExerciseTab() {
  const [date, setDate] = useState(todayStr());
  const [exercise, setExercise] = useState<ExerciseLog[]>([]);
  const [open, setOpen] = useState(false);
  const [tick, setTick] = useState(0);

  const load = useCallback(() => {
    api<{ exercise: ExerciseLog[] }>(`/logs?date=${date}`).then((r) => setExercise(r.exercise));
  }, [date]);
  useEffect(load, [load, tick]);

  const total = exercise.reduce((s, e) => s + e.calories, 0);

  return (
    <>
      <DayNav date={date} setDate={setDate} />
      <Card className="flex items-center justify-between">
        <div className="text-[13px] text-muted-foreground">当日消耗</div>
        <div className="tnum text-2xl font-bold text-good">
          {total} <span className="text-xs font-normal text-muted-foreground">kcal</span>
        </div>
      </Card>
      <Card className="p-0">
        {exercise.map((e) => (
          <div key={e.id} className="flex items-center justify-between border-b border-border/50 px-4 py-3 last:border-0">
            <div className="flex items-center gap-2.5">
              <span className="text-lg">🔥</span>
              <div>
                <div className="text-[14px]">{e.activity}</div>
                <div className="tnum mt-0.5 text-[11px] text-muted-foreground">{e.minutes} 分钟</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="tnum text-[14px] font-bold text-good">-{e.calories}</span>
              <button
                className="text-[16px] leading-none text-muted-foreground/50"
                onClick={() => api(`/exercise/${e.id}`, { method: 'DELETE' }).then(() => setTick((t) => t + 1))}
              >
                ×
              </button>
            </div>
          </div>
        ))}
        {exercise.length === 0 && <Empty icon="🏃" text="这一天没动" />}
      </Card>
      <button
        className="wob fixed right-5 bottom-28 z-30 flex size-14 items-center justify-center border-2 border-ink bg-good text-2xl font-light text-[#0e3d2b] ink-shadow press"
        onClick={() => setOpen(true)}
        aria-label="添加运动"
      >
        +
      </button>
      <ExerciseSheet open={open} onClose={() => { setOpen(false); setTick((t) => t + 1); }} date={date} />
    </>
  );
}
