import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db, addEvent } from './db.mjs';
import { todayStr, addDays, diffDays, round1, nowIso } from './util.mjs';
import {
  recomputeTrends, lastTrendBefore, streakOf, calcBudget,
  settleUser, changeCredit, coachText,
} from './logic.mjs';
import { FOODS } from './foods.mjs';
import { EXERCISES, exerciseKcal } from './exercises.mjs';
import {
  aiChat, extractJsonArray, extractJsonObject, coachCache, invalidateCoach, takeQuota,
  COACH_SYSTEM, CHAT_SYSTEM, parseSystem, commandSystem,
  resolveConfig, listRemoteModels, exerciseParseSystem, maskKey,
  PROVIDERS, providerById, getAiGlobal, saveAiSlot, clearAiSlot, publicSlot,
  getProviderCredential, allProviderCredentials, saveProviderCredential, clearProviderCredential,
  ttsConfig, asrConfig, aiTts, aiAsr,
} from './ai.mjs';

export const SECRET = process.env.JWT_SECRET || 'pofu-dev-secret-change-me';
const r = express.Router();

// ---------- 中间件 ----------

const attempts = new Map(); // ip -> {n, reset}
function rateLimit(req, res, next) {
  const ip = req.ip || 'x';
  const now = Date.now();
  let a = attempts.get(ip);
  if (!a || now > a.reset) { a = { n: 0, reset: now + 10 * 60 * 1000 }; attempts.set(ip, a); }
  if (++a.n > 30) return res.status(429).json({ error: '请求太频繁，稍后再试' });
  next();
}

function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: '未登录' });
  try {
    const { uid } = jwt.verify(token, SECRET);
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(uid);
    if (!user) throw new Error('gone');
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: '登录已过期，请重新登录' });
  }
}

/** 创始人专属（AI 模型配置只有创始人能改） */
function founderOnly(req, res, next) {
  if (req.user.role !== 'founder') {
    return res.status(403).json({ error: '只有创始人能配置 AI 模型' });
  }
  next();
}

// 创始人账号：.env 里 FOUNDER_USERNAME / FOUNDER_PASSWORD，启动时自动创建/更新
export function ensureFounder() {
  const username = (process.env.FOUNDER_USERNAME || '').trim();
  const password = (process.env.FOUNDER_PASSWORD || '').trim();
  if (!username || !password) return { configured: false };
  const existing = db.prepare('SELECT * FROM users WHERE username=?').get(username);
  if (existing) {
    if (existing.role !== 'founder') {
      db.prepare("UPDATE users SET role='founder' WHERE id=?").run(existing.id);
    }
    if (!bcrypt.compareSync(password, existing.password_hash)) {
      db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(password, 10), existing.id);
    }
    return { configured: true, created: false, username };
  }
  db.prepare(
    "INSERT INTO users (username,password_hash,nickname,role,created_at) VALUES (?,?,?,'founder',?)"
  ).run(username, bcrypt.hashSync(password, 10), username, nowIso());
  return { configured: true, created: true, username };
}

// 邀请码：INVITE_CODE 环境变量，逗号分隔可配多个；不配置则注册关闭
function inviteCodes() {
  return (process.env.INVITE_CODE || '').split(',').map((s) => s.trim()).filter(Boolean);
}

// 统一错误包装 + zod 报错中文化（兼容同步/异步处理器）
const h = (fn) => (req, res) => {
  const fail = (e) => {
    if (e instanceof z.ZodError) {
      return res.status(400).json({ error: e.issues[0]?.message || '参数不合法' });
    }
    console.error(e);
    res.status(500).json({ error: '服务器开小差了' });
  };
  try {
    const out = fn(req, res);
    if (out && typeof out.catch === 'function') out.catch(fail);
  } catch (e) {
    fail(e);
  }
};

// ---------- 工具 ----------

function safeUser(row) {
  const { password_hash, ...u } = row;
  u.streak = streakOf(u.id);
  return u;
}

function todayPayload(uid) {
  settleUser(uid);
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(uid);
  const today = todayStr();
  const weigh = db.prepare('SELECT * FROM weigh_ins WHERE user_id=? AND date=?').get(uid, today);
  const trend = lastTrendBefore(uid, today);
  const prev = db.prepare('SELECT trend FROM weigh_ins WHERE user_id=? AND date<? ORDER BY date DESC LIMIT 1').get(uid, today);
  const pledge = db.prepare(
    "SELECT * FROM pledges WHERE user_id=? AND status='active' ORDER BY id DESC LIMIT 1"
  ).get(uid);
  const contract = db.prepare(
    "SELECT * FROM contracts WHERE user_id=? AND status='active' ORDER BY week_start DESC LIMIT 1"
  ).get(uid);
  const intake = db.prepare('SELECT COALESCE(SUM(calories),0) AS s FROM diet_logs WHERE user_id=? AND date=?').get(uid, today).s;
  const burned = db.prepare('SELECT COALESCE(SUM(calories),0) AS s FROM exercise_logs WHERE user_id=? AND date=?').get(uid, today).s;
  const pendingStakes = db.prepare(
    "SELECT COALESCE(SUM(amount),0) AS s FROM stake_payments WHERE user_id=? AND status='pending'"
  ).get(uid).s;

  const weightForCalc = trend ?? (weigh ? weigh.weight_kg : 70);
  const pace = pledge ? pledge.weekly_pace : 0.5;
  const { tdee, budget } = calcBudget(user, weightForCalc, pace);

  const out = {
    date: today,
    weighed: !!weigh,
    weight: weigh ? weigh.weight_kg : null,
    note: weigh ? weigh.note : '',
    trend,
    trendDelta: prev && trend !== null ? round1(trend - prev.trend) : null,
    streak: streakOf(uid),
    credit: user.credit,
    pendingStakes: Math.round(pendingStakes),
    calorie: { tdee, budget, intake: Math.round(intake), burned: Math.round(burned), remaining: Math.round(budget + burned - intake) },
    pledge: null,
    contract: null,
    totals: null,
    coach: '',
  };

  if (pledge) {
    out.pledge = {
      id: pledge.id, start_weight: pledge.start_weight, start_date: pledge.start_date,
      target_weight: pledge.target_weight, deadline: pledge.deadline,
      weekly_pace: pledge.weekly_pace, stake_per_week: pledge.stake_per_week,
      punishment_desc: pledge.punishment_desc,
    };
    out.totals = {
      lost: trend === null ? 0 : round1(pledge.start_weight - trend),
      remaining_kg: trend === null ? round1(pledge.start_weight - pledge.target_weight) : round1(trend - pledge.target_weight),
      days_to_deadline: diffDays(today, pledge.deadline),
      total_weeks: Math.max(1, Math.ceil(diffDays(pledge.start_date, pledge.deadline) / 7)),
    };
  }
  if (contract) {
    out.contract = {
      week_no: contract.week_no, week_start: contract.week_start, week_end: contract.week_end,
      start_trend: contract.start_trend, target_weight: contract.target_weight,
      current_trend: trend,
      need: trend === null ? null : round1(trend - contract.target_weight),
      days_left: diffDays(today, contract.week_end) + 1,
      expected_days: contract.expected_days,
      weighed_days: out.weighed ? 1 : 0, // 前端另查
    };
  }
  out.coach = coachText(out);
  return out;
}

/** 把今日数据压缩成给教练的上下文 */
function coachContext(t, user) {
  const c = [];
  c.push(`昵称：${user.nickname || user.username}，信用分 ${t.credit}，连续打卡 ${t.streak} 天`);
  c.push(`今天${t.weighed ? `已称重：实称 ${t.weight?.toFixed(1)}kg，趋势 ${t.trend?.toFixed(1)}kg` : '还没称重'}${t.trendDelta !== null ? `，趋势较昨日 ${t.trendDelta > 0 ? '+' : ''}${t.trendDelta}kg` : ''}`);
  c.push(`热量：预算 ${t.calorie.budget}，已摄入 ${t.calorie.intake}，运动 ${t.calorie.burned}，剩余 ${t.calorie.remaining} kcal`);
  if (t.contract) {
    c.push(`第 ${t.contract.week_no} 周契约：目标 ${t.contract.target_weight}kg，当前趋势 ${t.contract.current_trend?.toFixed(1) ?? '--'}kg，${t.contract.need !== null ? (t.contract.need <= 0 ? '已提前达成' : `还差 ${t.contract.need}kg`) : ''}，剩 ${t.contract.days_left} 天`);
  } else {
    c.push('当前没有进行中的军令状');
  }
  if (t.pendingStakes > 0) c.push(`⚠️ 有 ${t.pendingStakes} 元罚金未缴`);
  if (t.totals) c.push(`总进度：已减 ${t.totals.lost}kg / 还需 ${t.totals.remaining_kg}kg，距截止 ${t.totals.days_to_deadline} 天`);
  return c.join('\n');
}

// ---------- 认证 ----------

const regSchema = z.object({
  username: z.string({ required_error: '请填写用户名' })
    .min(2, '用户名至少 2 个字符').max(20, '用户名最多 20 个字符')
    .regex(/^[\w\u4e00-\u9fa5]+$/, '用户名只能包含中英文、数字、下划线'),
  password: z.string({ required_error: '请填写密码' }).min(6, '密码至少 6 位').max(64),
  nickname: z.string().max(20, '昵称最多 20 个字').optional().default(''),
  inviteCode: z.string().max(50, '邀请码不对').optional().default(''),
});

r.post('/auth/register', rateLimit, h((req, res) => {
  const s = regSchema.parse(req.body);
  const codes = inviteCodes();
  if (codes.length === 0) {
    return res.status(400).json({ error: '注册未开放：服务器未配置邀请码' });
  }
  const given = s.inviteCode.trim();
  if (!given || !codes.some((c) => c.toLowerCase() === given.toLowerCase())) {
    return res.status(400).json({ error: '邀请码不对，找创始人要一个' });
  }
  const hash = bcrypt.hashSync(s.password, 10);
  try {
    const info = db.prepare(
      'INSERT INTO users (username, password_hash, nickname, created_at) VALUES (?,?,?,?)'
    ).run(s.username, hash, s.nickname || s.username, nowIso());
    const token = jwt.sign({ uid: Number(info.lastInsertRowid) }, SECRET, { expiresIn: '30d' });
    res.json({ token });
  } catch (e) {
    if (String(e).includes('UNIQUE')) return res.status(400).json({ error: '用户名已被占用' });
    throw e;
  }
}));

r.post('/auth/login', rateLimit, h((req, res) => {
  const s = z.object({
    username: z.string().min(1, '请填写用户名'),
    password: z.string().min(1, '请填写密码'),
  }).parse(req.body);
  const user = db.prepare('SELECT * FROM users WHERE username=?').get(s.username);
  if (!user || !bcrypt.compareSync(s.password, user.password_hash)) {
    return res.status(400).json({ error: '用户名或密码不对' });
  }
  const token = jwt.sign({ uid: user.id }, SECRET, { expiresIn: '30d' });
  res.json({ token });
}));

r.get('/bootstrap', auth, h((req, res) => {
  const n = db.prepare('SELECT COUNT(*) AS n FROM pledges WHERE user_id=?').get(req.user.id).n;
  res.json({ user: safeUser(req.user), hasPledge: n > 0 });
}));

r.put('/profile', auth, h((req, res) => {
  const s = z.object({
    nickname: z.string().max(20, '昵称最多 20 个字').optional(),
    gender: z.enum(['male', 'female']).optional(),
    birth_year: z.number().int().min(1930).max(2012).optional(),
    height_cm: z.number().min(100, '身高不合理').max(230, '身高不合理').optional(),
    activity: z.number().min(1.2).max(1.725).optional(),
  }).parse(req.body);
  const fields = Object.entries(s).filter(([, v]) => v !== undefined);
  for (const [k, v] of fields) db.prepare(`UPDATE users SET ${k}=? WHERE id=?`).run(v, req.user.id);
  res.json({ user: safeUser(db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id)) });
}));

// ---------- 军令状 & 契约 ----------

r.post('/pledge', auth, h((req, res) => {
  const s = z.object({
    target_weight: z.number({ invalid_type_error: '请填写目标体重' }).min(30, '目标体重不合理').max(250, '目标体重不合理'),
    deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '截止日期格式不对'),
    weekly_pace: z.number().min(0.25, '每周至少 0.25kg').max(1.5, '每周最多 1.5kg，太快伤身'),
    stake_per_week: z.number().min(0).max(100000, '罚金数额不合理').default(0),
    punishment_desc: z.string().max(100, '罚则说明最多 100 字').default(''),
  }).parse(req.body);

  const uid = req.user.id;
  const existing = db.prepare("SELECT id FROM pledges WHERE user_id=? AND status='active'").get(uid);
  if (existing) return res.status(400).json({ error: '已有进行中的军令状' });

  // 立状基准用最新一次实称（onboarding 刚记录的今晨体重），不用滞后的 EWMA 趋势：
  // 趋势被历史加权，反弹后重立状的用户会遇到「目标低于实称却被拒」或起点虚高
  const latest = db.prepare('SELECT weight_kg, trend FROM weigh_ins WHERE user_id=? ORDER BY date DESC LIMIT 1').get(uid);
  if (!latest) return res.status(400).json({ error: '请先记录当前体重' });
  if (s.target_weight >= latest.weight_kg) {
    return res.status(400).json({ error: `目标体重必须低于当前体重（${round1(latest.weight_kg)}kg）` });
  }

  const today = todayStr();
  if (diffDays(today, s.deadline) < 7) return res.status(400).json({ error: '截止日期至少在 7 天后' });
  if (diffDays(today, s.deadline) > 365) return res.status(400).json({ error: '截止日期最远一年' });

  db.prepare(
    `INSERT INTO pledges (user_id,start_weight,start_date,target_weight,deadline,weekly_pace,stake_per_week,punishment_desc,status,created_at)
     VALUES (?,?,?,?,?,?,?,?,'active',?)`
  ).run(uid, round1(latest.weight_kg), today, s.target_weight, s.deadline, s.weekly_pace, s.stake_per_week, s.punishment_desc, nowIso());
  settleUser(uid); // 生成本周契约
  addEvent(uid, 'pledge_created', {
    target_weight: s.target_weight,
    weeks: Math.ceil(diffDays(today, s.deadline) / 7),
    stake_per_week: s.stake_per_week,
  });
  res.json({ ok: true });
}));

r.post('/pledge/abandon', auth, h((req, res) => {
  const s = z.object({ confirm: z.literal('弃状', { errorMap: () => ({ message: '请输入「弃状」确认' }) }) }).parse(req.body);
  void s;
  const pledge = db.prepare("SELECT * FROM pledges WHERE user_id=? AND status='active' ORDER BY id DESC").get(req.user.id);
  if (!pledge) return res.status(400).json({ error: '没有进行中的军令状' });
  db.prepare("UPDATE pledges SET status='abandoned', settled_at=? WHERE id=?").run(nowIso(), pledge.id);
  db.prepare("UPDATE contracts SET status='skipped', settled_at=? WHERE pledge_id=? AND status='active'").run(nowIso(), pledge.id);
  changeCredit(req.user.id, -30);
  addEvent(req.user.id, 'pledge_abandoned', {});
  res.json({ ok: true });
}));

r.get('/pledge', auth, h((req, res) => {
  const pledge = db.prepare('SELECT * FROM pledges WHERE user_id=? ORDER BY id DESC LIMIT 1').get(req.user.id);
  const contracts = db.prepare('SELECT * FROM contracts WHERE user_id=? ORDER BY week_start DESC LIMIT 60').all(req.user.id);
  const stakes = db.prepare('SELECT * FROM stake_payments WHERE user_id=? ORDER BY id DESC').all(req.user.id);
  res.json({ pledge: pledge || null, contracts, stakes });
}));

// ---------- 日常 ----------

// 饮食/运动的每日汇总事件：同一天只保留一条，数量为 0 时删除（避免刷屏）
function refreshDailyEvent(userId, type, date) {
  const totals = type === 'diet'
    ? db.prepare('SELECT COUNT(*) n, COALESCE(SUM(calories),0) kcal FROM diet_logs WHERE user_id=? AND date=?').get(userId, date)
    : db.prepare('SELECT COUNT(*) n, COALESCE(SUM(calories),0) kcal, COALESCE(SUM(minutes),0) min FROM exercise_logs WHERE user_id=? AND date=?').get(userId, date);
  const existing = db.prepare(
    "SELECT id FROM events WHERE user_id=? AND type=? AND json_extract(payload,'$.d')=?"
  ).get(userId, type, date);
  if (totals.n === 0) {
    if (existing) db.prepare('DELETE FROM events WHERE id=?').run(existing.id);
    return;
  }
  const payload = type === 'diet'
    ? { d: date, n: totals.n, kcal: Math.round(totals.kcal) }
    : { d: date, n: totals.n, kcal: Math.round(totals.kcal), min: totals.min };
  if (existing) {
    db.prepare('UPDATE events SET payload=?, created_at=? WHERE id=?')
      .run(JSON.stringify(payload), new Date().toISOString(), existing.id);
  } else {
    addEvent(userId, type, payload);
  }
}

r.get('/today', auth, h((req, res) => {
  res.json(todayPayload(req.user.id));
}));

r.post('/weigh', auth, h((req, res) => {
  const s = z.object({
    weight_kg: z.number({ invalid_type_error: '请填写体重' }).min(25, '体重不合理').max(300, '体重不合理'),
    note: z.string().max(60, '备注最多 60 字').optional().default(''),
  }).parse(req.body);
  const uid = req.user.id;
  const today = todayStr();
  const existed = db.prepare('SELECT id FROM weigh_ins WHERE user_id=? AND date=?').get(uid, today);
  db.prepare(
    `INSERT INTO weigh_ins (user_id,date,weight_kg,trend,note,created_at) VALUES (?,?,?,?,?,?)
     ON CONFLICT(user_id,date) DO UPDATE SET weight_kg=excluded.weight_kg, note=excluded.note`
  ).run(uid, today, s.weight_kg, s.weight_kg, s.note, nowIso());
  const trend = recomputeTrends(uid);
  settleUser(uid);
  if (!existed) {
    // 广场只公开体重变化量，绝不公开绝对体重
    const prev = db.prepare('SELECT weight_kg FROM weigh_ins WHERE user_id=? AND date<? ORDER BY date DESC LIMIT 1').get(uid, today);
    addEvent(uid, 'checkin', {
      delta: prev ? round1(s.weight_kg - prev.weight_kg) : null,
      streak: streakOf(uid),
    });
  }
  invalidateCoach(uid);
  res.json(todayPayload(uid));
}));

r.get('/weights', auth, h((req, res) => {
  const days = Math.min(365, Math.max(7, Number(req.query.days) || 30));
  const from = addDays(todayStr(), -days);
  const rows = db.prepare(
    'SELECT date, weight_kg AS weight, trend FROM weigh_ins WHERE user_id=? AND date>=? ORDER BY date'
  ).all(req.user.id, from);
  res.json({ points: rows });
}));

const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'];

r.post('/diet', auth, h((req, res) => {
  const s = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().default(todayStr()),
    meal: z.enum(['breakfast', 'lunch', 'dinner', 'snack']).default('snack'),
    name: z.string().min(1, '请填写食物名').max(30, '名字太长'),
    qty: z.number().positive('数量要大于 0').max(100, '数量太大').default(1),
    unit: z.string().max(8).default('份'),
    calories: z.number().min(0).max(10000, '热量数值太大'),
  }).parse(req.body);
  if (s.date > todayStr()) return res.status(400).json({ error: '不能记录未来' });
  const info = db.prepare(
    'INSERT INTO diet_logs (user_id,date,meal,name,qty,unit,calories,created_at) VALUES (?,?,?,?,?,?,?,?)'
  ).run(req.user.id, s.date, s.meal, s.name, s.qty, s.unit, Math.round(s.calories), nowIso());
  refreshDailyEvent(req.user.id, 'diet', s.date);
  invalidateCoach(req.user.id);
  res.json({ id: Number(info.lastInsertRowid) });
}));

r.delete('/diet/:id', auth, h((req, res) => {
  const row = db.prepare('SELECT date FROM diet_logs WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  db.prepare('DELETE FROM diet_logs WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
  if (row) refreshDailyEvent(req.user.id, 'diet', row.date);
  res.json({ ok: true });
}));

r.post('/exercise', auth, h((req, res) => {
  const s = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().default(todayStr()),
    activity: z.string().min(1),
    minutes: z.number().int().min(1, '至少 1 分钟').max(600, '一次最多 600 分钟'),
  }).parse(req.body);
  if (s.date > todayStr()) return res.status(400).json({ error: '不能记录未来' });
  const ex = EXERCISES.find((e) => e.name === s.activity);
  if (!ex) return res.status(400).json({ error: '不认识这个运动' });
  const weigh = db.prepare('SELECT weight_kg FROM weigh_ins WHERE user_id=? ORDER BY date DESC LIMIT 1').get(req.user.id);
  const kcal = exerciseKcal(ex.met, weigh ? weigh.weight_kg : 65, s.minutes);
  const info = db.prepare(
    'INSERT INTO exercise_logs (user_id,date,activity,minutes,calories,created_at) VALUES (?,?,?,?,?,?)'
  ).run(req.user.id, s.date, s.activity, s.minutes, kcal, nowIso());
  refreshDailyEvent(req.user.id, 'exercise', s.date);
  invalidateCoach(req.user.id);
  res.json({ id: Number(info.lastInsertRowid), calories: kcal });
}));

r.delete('/exercise/:id', auth, h((req, res) => {
  const row = db.prepare('SELECT date FROM exercise_logs WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  db.prepare('DELETE FROM exercise_logs WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
  if (row) refreshDailyEvent(req.user.id, 'exercise', row.date);
  res.json({ ok: true });
}));

r.get('/logs', auth, h((req, res) => {
  const date = String(req.query.date || todayStr());
  const diet = db.prepare('SELECT * FROM diet_logs WHERE user_id=? AND date=? ORDER BY id').all(req.user.id, date);
  const exercise = db.prepare('SELECT * FROM exercise_logs WHERE user_id=? AND date=? ORDER BY id').all(req.user.id, date);
  res.json({ date, diet, exercise });
}));

// ---------- 罚金 ----------

r.post('/stakes/:id/pay', auth, h((req, res) => {
  const s = z.object({ proof_note: z.string().max(100).optional().default('') }).parse(req.body);
  const st = db.prepare('SELECT * FROM stake_payments WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!st) return res.status(404).json({ error: '记录不存在' });
  if (st.status !== 'pending') return res.status(400).json({ error: '该笔已处理' });
  db.prepare("UPDATE stake_payments SET status='paid', proof_note=?, paid_at=? WHERE id=?").run(s.proof_note, nowIso(), st.id);
  invalidateCoach(req.user.id);
  changeCredit(req.user.id, +5);
  addEvent(req.user.id, 'stake_paid', { amount: st.amount });
  res.json({ ok: true });
}));

r.post('/stakes/:id/deny', auth, h((req, res) => {
  const st = db.prepare('SELECT * FROM stake_payments WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!st) return res.status(404).json({ error: '记录不存在' });
  if (st.status !== 'pending') return res.status(400).json({ error: '该笔已处理' });
  db.prepare("UPDATE stake_payments SET status='denied', paid_at=? WHERE id=?").run(nowIso(), st.id);
  invalidateCoach(req.user.id);
  changeCredit(req.user.id, -50);
  addEvent(req.user.id, 'stake_denied', { amount: st.amount });
  res.json({ ok: true });
}));

// ---------- 广场 ----------

r.get('/square', auth, h((req, res) => {
  const before = Number(req.query.before) || Number.MAX_SAFE_INTEGER;
  const scope = req.query.scope || 'all';
  let sql = `SELECT e.id, e.user_id, e.type, e.payload, e.created_at, u.username, u.nickname
             FROM events e JOIN users u ON u.id = e.user_id WHERE e.id < ?`;
  const params = [before];
  if (scope === 'friends') {
    sql += " AND (e.user_id IN (SELECT friend_id FROM friends WHERE user_id=? AND status='accepted') OR e.user_id=?)";
    params.push(req.user.id, req.user.id);
  }
  sql += ' ORDER BY e.id DESC LIMIT 50';
  const rows = db.prepare(sql).all(...params);
  res.json({
    events: rows.map((row) => {
      const payload = JSON.parse(row.payload);
      // 旧打卡事件曾带绝对体重，这里脱敏：只保留变化量与连续天数
      if (row.type === 'checkin' && (payload.weight !== undefined || payload.trend !== undefined)) {
        return {
          id: row.id, type: row.type, payload: { delta: null, streak: payload.streak }, created_at: row.created_at,
          user: { id: row.user_id, username: row.username, nickname: row.nickname || row.username },
        };
      }
      return {
        id: row.id, type: row.type, payload, created_at: row.created_at,
        user: { id: row.user_id, username: row.username, nickname: row.nickname || row.username },
      };
    }),
  });
}));

r.get('/leaderboard', auth, h((req, res) => {
  const users = db.prepare('SELECT * FROM users').all();
  const wins = Object.fromEntries(
    db.prepare("SELECT user_id, COUNT(*) AS n FROM contracts WHERE status='success' GROUP BY user_id")
      .all().map((x) => [x.user_id, x.n])
  );
  const items = users.map((u) => ({
    id: u.id, username: u.username, nickname: u.nickname || u.username,
    credit: u.credit, streak: streakOf(u.id), wins: wins[u.id] || 0,
  }));
  items.sort((a, b) => b.credit - a.credit || b.streak - a.streak || b.wins - a.wins);
  const top = items.slice(0, 20);
  const myRank = items.findIndex((x) => x.id === req.user.id) + 1;
  if (myRank > 20) top.push(items[myRank - 1]);
  res.json({ items: top, myRank, total: items.length });
}));

// ---------- 数据字典 ----------

r.get('/foods', h((req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  let list = FOODS;
  if (q) list = list.filter((f) => f.name.toLowerCase().includes(q));
  list = list.slice(0, 40);
  res.json({ foods: list });
}));

r.get('/exercises', h((req, res) => {
  res.json({ exercises: EXERCISES });
}));

r.get('/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

// ---------- AI 能力（未配置时自动降级） ----------
// 模型配置归创始人统一管理：对话 / TTS / ASR 三个能力独立配置，全部存服务端

r.get('/ai-status', h((req, res) => {
  res.json({
    enabled: !!resolveConfig(),
    model: resolveConfig()?.model ?? null,
    tts: !!ttsConfig(),
    asr: !!asrConfig(),
  });
}));

// 所有用户可见的脱敏状态（明文 Key 永不下发）
r.get('/ai/settings', auth, h((req, res) => {
  const g = getAiGlobal();
  res.json({
    role: req.user.role,
    chat: publicSlot(g.chat || resolveConfig()),
    tts: publicSlot(g.tts),
    asr: publicSlot(g.asr),
  });
}));

// 创始人配置页用：官方 provider 注册表 + 各家凭证状态（Key 掩码，明文永不下发）
r.get('/ai/providers', auth, founderOnly, h((req, res) => {
  const creds = Object.fromEntries(allProviderCredentials().map((c) => [c.provider, c]));
  res.json({
    providers: PROVIDERS.map((p) => {
      const c = creds[p.id];
      return {
        ...p,
        configured: !!c,
        maskedKey: c ? maskKey(c.apiKey) : null,
        baseUrlUsed: c ? c.baseUrl : null,
      };
    }),
  });
}));

// 配置服务商凭证：校验通过（或厂商不开放 /models）后保存
r.put('/ai/providers/:id', auth, founderOnly, h(async (req, res) => {
  const p = providerById(req.params.id);
  if (!p) return res.status(400).json({ error: '不认识的服务商' });
  const s = z.object({
    apiKey: z.string().min(1, '填 API Key').max(200),
    baseUrl: z.string().max(300).optional(),
  }).parse(req.body);
  const baseUrl = (s.baseUrl || '').trim().replace(/\/+$/, '') || p.baseUrl;
  try {
    await listRemoteModels({ baseUrl, apiKey: s.apiKey.trim(), model: '' });
  } catch (e) {
    // 401/403 = Key 明确无效；其他错误（404/网络）说明厂商不开放 /models，放行保存
    if (e.status === 401 || e.status === 403) {
      return res.status(400).json({ error: `API Key 无效（${p.name}返回 ${e.status}）` });
    }
    console.warn(`[ai] ${p.id} 凭证校验跳过（厂商可能不开放 /models）：${e.message}`);
  }
  saveProviderCredential(p.id, s.apiKey.trim(), baseUrl);
  res.json({ ok: true, provider: p.id, maskedKey: maskKey(s.apiKey.trim()), baseUrl });
}));

// 删除服务商凭证（引用它的能力配置一并清空）
r.delete('/ai/providers/:id', auth, founderOnly, h((req, res) => {
  const p = providerById(req.params.id);
  if (!p) return res.status(400).json({ error: '不认识的服务商' });
  const cleared = clearProviderCredential(p.id);
  coachCache.clear();
  res.json({ ok: true, clearedSlots: cleared });
}));

// 拉取某服务商的模型列表（用已保存的凭证）
r.get('/ai/providers/:id/models', auth, founderOnly, h(async (req, res) => {
  const p = providerById(req.params.id);
  if (!p) return res.status(400).json({ error: '不认识的服务商' });
  const cred = getProviderCredential(p.id);
  if (!cred) return res.status(400).json({ error: '先配置这家服务商的 API Key' });
  if (!takeQuota(`models:${req.user.id}`, 30)) {
    return res.status(429).json({ error: '拉取太频繁，稍后再试' });
  }
  try {
    res.json({ models: await listRemoteModels({ baseUrl: cred.baseUrl, apiKey: cred.apiKey, model: '' }) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}));

// 能力分配：某能力绑定「已配置的服务商 + 它的模型」
r.put('/ai/settings', auth, founderOnly, h(async (req, res) => {
  const s = z.object({
    slot: z.enum(['chat', 'tts', 'asr']),
    provider: z.string().min(1),
    model: z.string().min(1, '选一个模型').max(100),
    voice: z.string().max(50).optional(),
  }).parse(req.body);
  const p = providerById(s.provider);
  if (!p) return res.status(400).json({ error: '不认识的服务商' });
  const cred = getProviderCredential(s.provider);
  if (!cred) return res.status(400).json({ error: `先在「服务商」里配置 ${p.name} 的 API Key` });

  if (s.slot === 'chat') {
    // 对话模型严格校验：能拉到列表就必须在列表内；拉不到则放行（调用时报错再说）
    try {
      const models = await listRemoteModels({ baseUrl: cred.baseUrl, apiKey: cred.apiKey, model: '' });
      if (models.length > 0 && !models.includes(s.model)) {
        return res.status(400).json({ error: `模型 ${s.model} 不在 ${p.name} 的列表里` });
      }
    } catch (e) {
      console.warn(`[ai] chat/${s.provider} 保存前校验跳过：${e.message}`);
    }
  }

  const saved = { provider: s.provider, model: s.model.trim() };
  if (s.slot === 'tts' && s.voice) saved.voice = s.voice.trim();
  saveAiSlot(s.slot, saved);
  coachCache.clear();
  res.json({ ok: true, slot: s.slot, ...publicSlot(withCredentialFor(saved)) });
}));

/** publicSlot 需要完整凭证（maskedKey），单独组装 */
function withCredentialFor(slotCfg) {
  const cred = slotCfg.provider ? getProviderCredential(slotCfg.provider) : null;
  return cred ? { ...slotCfg, apiKey: cred.apiKey, baseUrl: cred.baseUrl, source: 'global' } : slotCfg;
}

// 清除某个能力的配置
r.delete('/ai/settings/:slot', auth, founderOnly, h((req, res) => {
  if (!['chat', 'tts', 'asr'].includes(req.params.slot)) {
    return res.status(400).json({ error: '未知配置项' });
  }
  clearAiSlot(req.params.slot);
  coachCache.clear();
  res.json({ ok: true });
}));

// TTS：文字 → 语音（OpenAI 兼容 /audio/speech 代理，返回音频流）
r.post('/ai/tts', auth, h(async (req, res) => {
  const s = z.object({ text: z.string().min(1, '没内容').max(600, '一次最多 600 字') }).parse(req.body);
  const cfg = ttsConfig();
  if (!cfg) return res.status(503).json({ error: '语音合成未配置' });
  if (!takeQuota(`tts:${req.user.id}`, 30)) {
    return res.status(429).json({ error: '今天听得够多了，明天再听' });
  }
  try {
    const { buffer, contentType } = await aiTts(cfg, s.text);
    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'no-store');
    res.send(buffer);
  } catch (e) {
    console.error('[tts]', e.message);
    res.status(502).json({ error: '语音合成失败：' + e.message });
  }
}));

// ASR：浏览器录音 → 文字（OpenAI 兼容 /audio/transcriptions 代理，原始二进制转 multipart）
r.post('/ai/asr', auth, express.raw({ type: ['audio/*', 'application/octet-stream'], limit: '12mb' }), h(async (req, res) => {
  const cfg = asrConfig();
  if (!cfg) return res.status(503).json({ error: '语音识别未配置' });
  if (!req.body || !req.body.length) return res.status(400).json({ error: '没有收到录音' });
  if (!takeQuota(`asr:${req.user.id}`, 60)) {
    return res.status(429).json({ error: '今天说得够多了，用键盘吧' });
  }
  try {
    const text = await aiAsr(cfg, req.body, req.headers['content-type']);
    res.json({ text });
  } catch (e) {
    console.error('[asr]', e.message);
    res.status(502).json({ error: '语音识别失败：' + e.message });
  }
}));

// 教练日报：配置了 AI 走大模型（带 5 分钟缓存），否则用规则教练
r.get('/coach', auth, h(async (req, res) => {
  const uid = req.user.id;
  const payload = todayPayload(uid);
  const cfg = resolveConfig();
  if (!cfg) return res.json({ ai: false, text: payload.coach, tts: false });
  const cached = coachCache.get(uid);
  if (cached && Date.now() - cached.t < 5 * 60 * 1000) {
    return res.json({ ai: true, text: cached.text, tts: !!ttsConfig() });
  }
  try {
    const text = await aiChat(
      cfg,
      [
        { role: 'system', content: COACH_SYSTEM },
        { role: 'user', content: `用户今日数据：\n${coachContext(payload, req.user)}\n\n发今日简报。` },
      ],
      { max_tokens: 300, temperature: 0.7 },
    );
    coachCache.set(uid, { t: Date.now(), text });
    res.json({ ai: true, text, tts: !!ttsConfig() });
  } catch (e) {
    console.error('[coach]', e.message);
    res.json({ ai: false, text: payload.coach, fallback: true, tts: !!ttsConfig() });
  }
}));

// 教练对话：客户端携带最近若干轮，服务端注入实时数据上下文
r.post('/coach/chat', auth, h(async (req, res) => {
  const s = z.object({
    messages: z
      .array(z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(2000, '单条消息太长'),
      }))
      .min(1, '说点什么')
      .max(20, '历史消息太多'),
  }).parse(req.body);
  const cfg = resolveConfig();
  if (!cfg) return res.status(503).json({ error: 'AI 未配置，教练只会说标准台词' });
  if (!takeQuota(`chat:${req.user.id}`, 80)) {
    return res.status(429).json({ error: '今天聊得够多了，去喝水' });
  }
  const payload = todayPayload(req.user.id);
  try {
    const reply = await aiChat(
      cfg,
      [
        { role: 'system', content: `${CHAT_SYSTEM}\n\n用户实时数据：\n${coachContext(payload, req.user)}` },
        ...s.messages.slice(-10),
      ],
      { max_tokens: 600, temperature: 0.7, timeoutMs: 60000 },
    );
    res.json({ reply });
  } catch (e) {
    console.error('[coach-chat]', e.message);
    res.status(502).json({ error: e.message || '教练走神了，再说一遍' });
  }
}));

// 自然语言记饮食：「中午吃了一碗牛肉面和一个卤蛋」→ 结构化条目
r.post('/diet/parse', auth, h(async (req, res) => {
  const s = z.object({ text: z.string().min(1, '说说你吃了什么').max(500, '一次最多 500 字') }).parse(req.body);
  const cfg = resolveConfig();
  if (!cfg) return res.status(503).json({ error: 'AI 未配置，用食物库或手动输入' });
  if (!takeQuota(`parse:${req.user.id}`, 40)) {
    return res.status(429).json({ error: '今日解析次数用完了，改用食物库吧' });
  }
  const raw = await aiChat(
    cfg,
    [
      { role: 'system', content: parseSystem() },
      { role: 'user', content: s.text },
    ],
    { max_tokens: 600, temperature: 0.2 },
  );
  res.json({ items: cleanDietItems(extractJsonArray(raw) || []) });
}));

/** AI 返回的饮食条目清洗（/diet/parse 与 /coach/command 共用） */
function cleanDietItems(arr) {
  const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'];
  return arr
    .filter((it) => it && typeof it.name === 'string' && typeof it.calories === 'number')
    .slice(0, 15)
    .map((it) => ({
      name: it.name.slice(0, 30),
      meal: MEALS.includes(it.meal) ? it.meal : 'snack',
      qty: Number(it.qty) > 0 && Number(it.qty) <= 100 ? Number(it.qty) : 1,
      unit: typeof it.unit === 'string' ? it.unit.slice(0, 8) : '份',
      calories: Math.max(0, Math.min(5000, Math.round(it.calories))),
    }));
}

// 语音/文字描述运动：「跑了五公里大概三十分钟」→ 结构化条目（活动名必须命中运动库）
r.post('/exercise/parse', auth, h(async (req, res) => {
  const s = z.object({ text: z.string().min(1, '说说你动了什么').max(500, '一次最多 500 字') }).parse(req.body);
  const cfg = resolveConfig();
  if (!cfg) return res.status(503).json({ error: 'AI 未配置，用列表选运动' });
  if (!takeQuota(`parse:${req.user.id}`, 40)) {
    return res.status(429).json({ error: '今日解析次数用完了，改用列表选吧' });
  }
  const raw = await aiChat(
    cfg,
    [
      { role: 'system', content: exerciseParseSystem(EXERCISES.map((e) => e.name)) },
      { role: 'user', content: s.text },
    ],
    { max_tokens: 500, temperature: 0.2 },
  );
  const weigh = db.prepare('SELECT weight_kg FROM weigh_ins WHERE user_id=? ORDER BY date DESC LIMIT 1').get(req.user.id);
  res.json({ items: cleanExerciseItems(extractJsonArray(raw) || [], weigh ? weigh.weight_kg : 65) });
}));

/** AI 返回的运动条目清洗 + 活动名严格回落运动库并按体重算消耗（共用） */
function cleanExerciseItems(arr, weight) {
  return arr
    .map((it) => {
      if (!it || typeof it.activity !== 'string') return null;
      // 活动名严格回落到运动库，防止模型自造名
      const hit = EXERCISES.find((e) => e.name === it.activity)
        || EXERCISES.find((e) => it.activity.includes(e.name) || e.name.includes(it.activity));
      if (!hit) return null;
      const minutes = Math.max(1, Math.min(600, Math.round(Number(it.minutes) || 30)));
      return { activity: hit.name, minutes, calories: exerciseKcal(hit.met, weight, minutes) };
    })
    .filter(Boolean)
    .slice(0, 10);
}

// 教练指令：一句话自动分流 —— 记体重 / 记饮食 / 记运动（返回待确认卡片数据）/ 闲聊（直接回复）
r.post('/coach/command', auth, h(async (req, res) => {
  const s = z.object({ text: z.string().min(1, '说点什么').max(500, '一次最多 500 字') }).parse(req.body);
  const cfg = resolveConfig();
  if (!cfg) return res.status(503).json({ error: 'AI 未配置，教练只会说标准台词' });
  if (!takeQuota(`parse:${req.user.id}`, 40)) {
    return res.status(429).json({ error: '今日次数用完了，稍后再说' });
  }

  try {
    const raw = await aiChat(
      cfg,
      [
        { role: 'system', content: commandSystem(todayStr(), EXERCISES.map((e) => e.name)) },
        { role: 'user', content: s.text },
      ],
      { max_tokens: 500, temperature: 0.1 },
    );
    const parsed = extractJsonObject(raw);

    // 称重
    if (parsed?.type === 'weigh' && Number(parsed.weight_kg) > 0) {
      const kg = Number(parsed.weight_kg);
      if (kg < 25 || kg > 300) {
        return res.json({ kind: 'chat', reply: `${kg}kg 不像体重，确认一下数字再报。` });
      }
      return res.json({ kind: 'action', action: { type: 'weigh', weight_kg: round1(kg), date: clampDate(parsed.date) } });
    }

    // 饮食
    if (parsed?.type === 'diet' && Array.isArray(parsed.items)) {
      const items = cleanDietItems(parsed.items);
      if (items.length > 0) {
        return res.json({ kind: 'action', action: { type: 'diet', date: clampDate(parsed.date), items } });
      }
    }

    // 运动
    if (parsed?.type === 'exercise' && Array.isArray(parsed.items)) {
      const weigh = db.prepare('SELECT weight_kg FROM weigh_ins WHERE user_id=? ORDER BY date DESC LIMIT 1').get(req.user.id);
      const items = cleanExerciseItems(parsed.items, weigh ? weigh.weight_kg : 65);
      if (items.length > 0) {
        return res.json({ kind: 'action', action: { type: 'exercise', date: clampDate(parsed.date), items } });
      }
    }

    // 闲聊 / 解析失败回落：走正常教练对话（带实时数据上下文）；长文本+慢模型容易久，放宽到 60s
    const payload = todayPayload(req.user.id);
    const reply = await aiChat(
      cfg,
      [
        { role: 'system', content: `${CHAT_SYSTEM}\n\n用户实时数据：\n${coachContext(payload, req.user)}` },
        { role: 'user', content: s.text },
      ],
      { max_tokens: 600, temperature: 0.7, timeoutMs: 60000 },
    );
    res.json({ kind: 'chat', reply });
  } catch (e) {
    console.error('[coach-command]', e.message);
    res.status(502).json({ error: e.message || '教练走神了，再说一遍' });
  }
}));

/** AI 给的日期只接受今天或过去，未来一律回落今天 */
function clampDate(d) {
  const today = todayStr();
  return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= today ? d : today;
}

// ---------- 好友 ----------

// 搜索用户（用户名/昵称模糊匹配），标注与我的好友关系
r.get('/friends/search', auth, h((req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json({ users: [] });
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const rows = db.prepare(
    `SELECT id, username, nickname FROM users
     WHERE id != ? AND (username LIKE ? ESCAPE '\\' OR nickname LIKE ? ESCAPE '\\')
     ORDER BY username LIMIT 20`
  ).all(req.user.id, like, like);
  const users = rows.map((u) => {
    const mine = db.prepare('SELECT status FROM friends WHERE user_id=? AND friend_id=?').get(req.user.id, u.id);
    const theirs = db.prepare('SELECT status FROM friends WHERE user_id=? AND friend_id=?').get(u.id, req.user.id);
    let rel = 'none';
    if (mine?.status === 'accepted' || theirs?.status === 'accepted') rel = 'friends';
    else if (mine?.status === 'pending') rel = 'pending_out';
    else if (theirs?.status === 'pending') rel = 'pending_in';
    return { id: u.id, username: u.username, nickname: u.nickname || u.username, rel };
  });
  res.json({ users });
}));

r.post('/friends', auth, h((req, res) => {
  const s = z.object({ username: z.string().min(1, '请填写用户名').max(20) }).parse(req.body);
  const me = req.user.id;
  const target = db.prepare('SELECT id, username, nickname FROM users WHERE username=?').get(s.username.trim());
  if (!target) return res.status(400).json({ error: '该用户不存在' });
  if (target.id === me) return res.status(400).json({ error: '不能添加自己为好友' });
  const mine = db.prepare('SELECT * FROM friends WHERE user_id=? AND friend_id=?').get(me, target.id);
  const theirs = db.prepare('SELECT * FROM friends WHERE user_id=? AND friend_id=?').get(target.id, me);
  if (mine?.status === 'accepted' || theirs?.status === 'accepted') {
    return res.status(400).json({ error: '你们已经是好友了' });
  }
  if (mine) return res.status(400).json({ error: '申请已发送，等对方处理' });
  if (theirs) {
    // 对方已向我发过申请，直接成为好友
    db.prepare("UPDATE friends SET status='accepted' WHERE id=?").run(theirs.id);
    db.prepare("INSERT OR IGNORE INTO friends (user_id,friend_id,status,created_at) VALUES (?,?,'accepted',?)").run(me, target.id, nowIso());
    addEvent(me, 'friendship', { with: target.nickname || target.username });
    return res.json({ ok: true, autoAccepted: true });
  }
  db.prepare("INSERT INTO friends (user_id,friend_id,status,created_at) VALUES (?,?,'pending',?)").run(me, target.id, nowIso());
  res.json({ ok: true });
}));

r.get('/friends', auth, h((req, res) => {
  const uid = req.user.id;
  const friends = db.prepare(
    `SELECT f.id AS row_id, u.id AS uid, u.username, u.nickname
     FROM friends f JOIN users u ON u.id=f.friend_id
     WHERE f.user_id=? AND f.status='accepted' ORDER BY f.id DESC`
  ).all(uid);
  const requestsIn = db.prepare(
    `SELECT f.id, u.username, u.nickname
     FROM friends f JOIN users u ON u.id=f.user_id
     WHERE f.friend_id=? AND f.status='pending' ORDER BY f.id DESC`
  ).all(uid);
  const requestsOut = db.prepare(
    `SELECT f.id, u.username, u.nickname
     FROM friends f JOIN users u ON u.id=f.friend_id
     WHERE f.user_id=? AND f.status='pending' ORDER BY f.id DESC`
  ).all(uid);
  res.json({ friends, requestsIn, requestsOut });
}));

r.post('/friends/:id/accept', auth, h((req, res) => {
  const row = db.prepare('SELECT * FROM friends WHERE id=?').get(req.params.id);
  if (!row || row.friend_id !== req.user.id || row.status !== 'pending') {
    return res.status(400).json({ error: '申请不存在' });
  }
  db.prepare("UPDATE friends SET status='accepted' WHERE id=?").run(row.id);
  db.prepare("INSERT OR IGNORE INTO friends (user_id,friend_id,status,created_at) VALUES (?,?,'accepted',?)").run(req.user.id, row.user_id, nowIso());
  const them = db.prepare('SELECT nickname, username FROM users WHERE id=?').get(row.user_id);
  addEvent(req.user.id, 'friendship', { with: them.nickname || them.username });
  res.json({ ok: true });
}));

r.post('/friends/:id/decline', auth, h((req, res) => {
  const row = db.prepare('SELECT * FROM friends WHERE id=?').get(req.params.id);
  if (!row || row.friend_id !== req.user.id) return res.status(400).json({ error: '申请不存在' });
  db.prepare('DELETE FROM friends WHERE id=?').run(row.id);
  res.json({ ok: true });
}));

r.delete('/friends/:rowId', auth, h((req, res) => {
  const row = db.prepare('SELECT * FROM friends WHERE id=? AND user_id=?').get(req.params.rowId, req.user.id);
  if (!row || row.status !== 'accepted') return res.status(400).json({ error: '好友不存在' });
  db.prepare('DELETE FROM friends WHERE (user_id=? AND friend_id=?) OR (user_id=? AND friend_id=?)')
    .run(row.user_id, row.friend_id, row.friend_id, row.user_id);
  res.json({ ok: true });
}));

// 好友每日攀比榜：只暴露打卡状态/连续天数/信用分/运动分钟/契约状态，绝不含体重与热量数值
r.get('/friends/board', auth, h((req, res) => {
  const uid = req.user.id;
  const today = todayStr();
  const friendIds = db.prepare(
    "SELECT friend_id FROM friends WHERE user_id=? AND status='accepted'"
  ).all(uid).map((r) => r.friend_id);
  const items = [uid, ...friendIds].map((id) => {
    const u = db.prepare('SELECT id, username, nickname, credit FROM users WHERE id=?').get(id);
    const weighed = !!db.prepare('SELECT id FROM weigh_ins WHERE user_id=? AND date=?').get(id, today);
    const exerciseMin = db.prepare(
      'SELECT COALESCE(SUM(minutes),0) AS s FROM exercise_logs WHERE user_id=? AND date=?'
    ).get(id, today).s;
    const pledge = db.prepare("SELECT * FROM pledges WHERE user_id=? AND status='active' ORDER BY id DESC LIMIT 1").get(id);
    let week = null;
    let calorieOk = null;
    if (pledge) {
      const contract = db.prepare(
        "SELECT * FROM contracts WHERE user_id=? AND status='active' ORDER BY week_start DESC LIMIT 1"
      ).get(id);
      const trend = lastTrendBefore(id, today);
      if (contract) {
        week = {
          week_no: contract.week_no,
          state: trend !== null && trend <= contract.target_weight + 0.05 ? 'ahead' : 'chasing',
        };
      }
      const intake = db.prepare('SELECT COALESCE(SUM(calories),0) AS s FROM diet_logs WHERE user_id=? AND date=?').get(id, today).s;
      const burned = db.prepare('SELECT COALESCE(SUM(calories),0) AS s FROM exercise_logs WHERE user_id=? AND date=?').get(id, today).s;
      const { budget } = calcBudget(u, trend ?? pledge.start_weight, pledge.weekly_pace);
      calorieOk = budget + burned - intake >= 0;
    }
    return {
      uid: u.id,
      username: u.username,
      nickname: u.nickname || u.username,
      isMe: u.id === uid,
      weighed,
      streak: streakOf(id),
      credit: u.credit,
      exerciseMin,
      calorieOk,
      week,
    };
  });
  items.sort((a, b) => b.streak - a.streak || b.credit - a.credit || b.exerciseMin - a.exerciseMin);
  res.json({ date: today, items });
}));

export const apiRouter = r;
