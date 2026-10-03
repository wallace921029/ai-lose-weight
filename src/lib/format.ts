export function addDays(s: string, n: number): string {
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function cnDate(s: string): string {
  const [, m, d] = s.split('-');
  return `${Number(m)}月${Number(d)}日`;
}

export function weekdayCN(s: string): string {
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][new Date(`${s}T00:00:00`).getDay()];
}

export function kg(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined) return '--';
  return n.toFixed(digits);
}

export function signed(n: number | null | undefined): string {
  if (n === null || n === undefined) return '--';
  return n > 0 ? `+${n.toFixed(1)}` : n.toFixed(1);
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} 天前`;
  return cnDate(iso.slice(0, 10));
}

export const MEAL_LABEL: Record<string, string> = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
  snack: '加餐',
};
