import type { WeightPoint } from '@/lib/types';
import { cnDate } from '@/lib/format';

// ---------- 体重曲线：真实值(淡) + 趋势线(主) + 目标线 ----------

export function WeightChart({
  points,
  target,
  height = 190,
}: {
  points: WeightPoint[];
  target?: number | null;
  height?: number;
}) {
  const W = 340;
  const H = height;
  const PL = 8, PR = 44, PT = 16, PB = 22;

  if (points.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        还没有称重记录
      </div>
    );
  }
  if (points.length === 1) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-1">
        <div className="tnum text-3xl font-bold">{points[0].weight.toFixed(1)}</div>
        <div className="text-xs text-muted-foreground">再称一天，曲线就会出现</div>
      </div>
    );
  }

  const first = points[0].date;
  const last = points[points.length - 1].date;
  const totalDays = Math.max(1, (new Date(`${last}T00:00:00`).getTime() - new Date(`${first}T00:00:00`).getTime()) / 86400000);
  const x = (d: string) => PL + ((new Date(`${d}T00:00:00`).getTime() - new Date(`${first}T00:00:00`).getTime()) / 86400000 / totalDays) * (W - PL - PR);

  const vals = points.flatMap((p) => [p.weight, p.trend]);
  if (target) vals.push(target);
  let min = Math.min(...vals), max = Math.max(...vals);
  const pad = Math.max(0.6, (max - min) * 0.15);
  min -= pad; max += pad;
  const y = (v: number) => PT + (1 - (v - min) / (max - min)) * (H - PT - PB);

  const rawPath = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.weight).toFixed(1)}`).join('');
  const trendPath = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.trend).toFixed(1)}`).join('');

  const lastP = points[points.length - 1];
  const gridVals = [max - (max - min) * 0.05, (max + min) / 2, min + (max - min) * 0.05];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      {gridVals.map((v, i) => (
        <g key={i}>
          <line x1={PL} x2={W - PR} y1={y(v)} y2={y(v)} stroke="#43352a" strokeOpacity="0.14" strokeWidth="1" strokeDasharray={i === 1 ? '' : '3 4'} />
          <text x={W - PR + 4} y={y(v) + 3.5} fontSize="9" fill="#8f7c66" className="tnum">
            {v.toFixed(1)}
          </text>
        </g>
      ))}
      {target ? (
        <g>
          <line x1={PL} x2={W - PR} y1={y(target)} y2={y(target)} stroke="#35b183" strokeWidth="1.4" strokeDasharray="6 4" opacity="0.85" />
          <text x={PL + 2} y={y(target) - 4} fontSize="9" fill="#1f8f63" className="font-bold">
            目标 {target.toFixed(1)}
          </text>
        </g>
      ) : null}
      <path d={rawPath} fill="none" stroke="#c4b294" strokeWidth="1.6" opacity="0.8" />
      {points.map((p) => (
        <circle key={p.date} cx={x(p.date)} cy={y(p.weight)} r="2" fill="#fffdf6" stroke="#8f7c66" strokeWidth="1" />
      ))}
      <path d={trendPath} fill="none" stroke="#fa5f4a" strokeWidth="3" strokeLinecap="round" />
      <circle cx={x(lastP.date)} cy={y(lastP.trend)} r="3.5" fill="#fa5f4a" stroke="#43352a" strokeWidth="1.2" />
      <circle cx={x(lastP.date)} cy={y(lastP.trend)} r="7.5" fill="#fa5f4a" opacity="0.18" />
      <text x={PL} y={H - 6} fontSize="9" fill="#8f7c66">
        {cnDate(first)}
      </text>
      <text x={W - PR - 30} y={H - 6} fontSize="9" fill="#8f7c66">
        {cnDate(last)}
      </text>
    </svg>
  );
}

// ---------- 热量环 ----------

export function CalorieRing({
  intake,
  budget,
  burned,
  size = 132,
}: {
  intake: number;
  budget: number;
  burned: number;
  size?: number;
}) {
  const stroke = 11;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const ratio = budget > 0 ? intake / budget : 0;
  const clamped = Math.min(1, ratio);
  const remaining = budget + burned - intake;
  const color = ratio > 1.15 ? '#fa5f4a' : ratio > 1 ? '#ee9414' : '#35b183';

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f0e0bf" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${clamped * c} ${c}`}
          style={{ transition: 'stroke-dasharray 0.6s ease, stroke 0.3s' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className={`tnum text-[26px] leading-none font-bold ${remaining < 0 ? 'text-brand' : ''}`}>
          {Math.abs(Math.round(remaining))}
        </div>
        <div className="mt-1 text-[10px] text-muted-foreground">
          {remaining < 0 ? '超支 kcal' : '还能吃 kcal'}
        </div>
      </div>
    </div>
  );
}
