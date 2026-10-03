// 日期一律用 YYYY-MM-DD 字符串在 UTC 锚点上运算，避免时区漂移
export const TZ = process.env.TZ_NAME || 'Asia/Shanghai';

export function todayStr() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: TZ });
}

export function nowIso() {
  return new Date().toISOString();
}

export function parseD(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function fmtD(dt) {
  return dt.toISOString().slice(0, 10);
}

export function addDays(s, n) {
  const dt = parseD(s);
  dt.setUTCDate(dt.getUTCDate() + n);
  return fmtD(dt);
}

export function diffDays(a, b) {
  return Math.round((parseD(b) - parseD(a)) / 86400000);
}

// 周一为一周起点
export function isoWeekStart(s) {
  const dt = parseD(s);
  const idx = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - idx);
  return fmtD(dt);
}

export function round1(n) {
  return Math.round(n * 10) / 10;
}

export function clamp(n, a, b) {
  return Math.min(b, Math.max(a, n));
}

export function pad(n) {
  return String(n).padStart(2, '0');
}

// 2026-10-03 -> 10月03日
export function cnDate(s) {
  const [, m, d] = s.split('-');
  return `${Number(m)}月${Number(d)}日`;
}
