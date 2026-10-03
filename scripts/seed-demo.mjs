// 演示数据种子：三个用户 —— 铁头娃(优等生) / 阿香(稳扎稳打) / 老K(刚翻车,罚金待缴)
// 直接操作数据库构造 30 天历史 + 周契约 + 事件流，用于演示与验收
import { createRequire } from 'node:module';
const require = createRequire(new URL('../backend/package.json', import.meta.url));
const bcrypt = require('bcryptjs');
import { db, addEvent } from '../backend/src/db.mjs';
import { recomputeTrends, streakOf } from '../backend/src/logic.mjs';
import { todayStr, addDays, isoWeekStart, round1 } from '../backend/src/util.mjs';

const TODAY = todayStr();
const hash = bcrypt.hashSync('demo123456', 10);

function wipe(username) {
  const u = db.prepare('SELECT id FROM users WHERE username=?').get(username);
  if (!u) return;
  for (const t of ['weigh_ins', 'diet_logs', 'exercise_logs', 'stake_payments', 'witnesses', 'events', 'contracts', 'pledges']) {
    db.prepare(`DELETE FROM ${t} WHERE user_id=?`).run(u.id);
  }
  db.prepare('DELETE FROM users WHERE id=?').run(u.id);
}

function mkUser(username, nickname, gender, height, birthYear, credit) {
  const info = db.prepare(
    'INSERT INTO users (username,password_hash,nickname,gender,birth_year,height_cm,activity,credit,created_at) VALUES (?,?,?,?,?,?,?,?,?)'
  ).run(username, hash, nickname, gender, birthYear, height, 1.375, credit, new Date().toISOString());
  return Number(info.lastInsertRowid);
}

function weigh(uid, date, kgv) {
  db.prepare('INSERT INTO weigh_ins (user_id,date,weight_kg,trend,note,created_at) VALUES (?,?,?,?,?,?)')
    .run(uid, date, kgv, kgv, '', `${date}T08:00:00.000Z`);
}

function trendAt(uid, date) {
  const r = db.prepare('SELECT trend FROM weigh_ins WHERE user_id=? AND date<=? ORDER BY date DESC LIMIT 1').get(uid, date);
  if (r) return r.trend;
  // 该日期早于首条记录时回退到最早的趋势值
  const f = db.prepare('SELECT trend FROM weigh_ins WHERE user_id=? ORDER BY date LIMIT 1').get(uid);
  return f ? f.trend : null;
}

// 伪随机但可复现
let seedN = 42;
function rnd() {
  seedN = (seedN * 16807) % 2147483647;
  return seedN / 2147483647 - 0.5;
}

function buildHistory({ uid, days, slope, base, skipDates = [], weighNote }) {
  void weighNote;
  for (let i = days; i >= 0; i--) {
    const d = addDays(TODAY, -i);
    if (skipDates.includes(d)) continue;
    const noise = (i === 0 ? 0 : rnd()) * 0.7; // 当天不加噪音
    weigh(uid, d, round1(base - slope * (days - i) + noise));
  }
  recomputeTrends(uid);
}

function mkPledge(uid, startWeight, startDate, target, pace, stake, punish) {
  const info = db.prepare(
    `INSERT INTO pledges (user_id,start_weight,start_date,target_weight,deadline,weekly_pace,stake_per_week,punishment_desc,status,created_at)
     VALUES (?,?,?,?,?,?,?,?,'active',?)`
  ).run(uid, startWeight, startDate, target, addDays(startDate, 90), pace, stake, punish, `${startDate}T08:00:00.000Z`);
  return Number(info.lastInsertRowid);
}

function mkContract(pledgeId, uid, weekStart, weekNo, startTrend, target, status, missDays = 0) {
  db.prepare(
    `INSERT INTO contracts (pledge_id,user_id,week_no,week_start,week_end,expected_days,start_trend,target_weight,status,miss_days,end_trend,settled_at,created_at)
     VALUES (?,?,?,?,?,7,?,?,?,?,?,?,?)`
  ).run(pledgeId, uid, weekNo, weekStart, addDays(weekStart, 6), startTrend, target, status, missDays,
    status === 'active' ? null : trendAt(uid, addDays(weekStart, 6)),
    status === 'active' ? null : `${addDays(weekStart, 6)}T22:00:00.000Z`,
    `${weekStart}T08:00:00.000Z`);
}

// ---------- 1. 铁头娃：30 天 -3kg，4 个成功周 + 本周进行中 ----------
wipe('demo1');
{
  const uid = mkUser('demo1', '铁头娃', 'male', 175, 1990, 100);
  const start = addDays(TODAY, -30);
  buildHistory({ uid, days: 30, slope: 0.105, base: 82.4 });
  const startTrend = trendAt(uid, start);
  const p = mkPledge(uid, 82.4, start, 72, 0.5, 100, '捐给流浪猫救助站');
  // 过去 4 周（不含本周）
  let t = startTrend;
  for (let w = 4; w >= 1; w--) {
    const ws = isoWeekStart(addDays(TODAY, -7 * w));
    const st = trendAt(uid, ws);
    t = st;
    mkContract(p, uid, ws, 5 - w, st, round1(st - 0.5), 'success');
    addEvent(uid, 'contract_success', { week_no: 5 - w, delta: round1(t - trendAt(uid, addDays(ws, 6))), target: round1(st - 0.5) });
  }
  // 本周
  const wsNow = isoWeekStart(TODAY);
  mkContract(p, uid, wsNow, 5, trendAt(uid, wsNow), round1(trendAt(uid, wsNow) - 0.5), 'active');
  addEvent(uid, 'pledge_created', { target_weight: 72, weeks: 13, stake_per_week: 100 });
  addEvent(uid, 'checkin', { weight: trendAt(uid, TODAY), trend: round1(trendAt(uid, TODAY)), streak: streakOf(uid) });
  addEvent(uid, 'milestone', { total_lost: round1(82.4 - trendAt(uid, TODAY)), level: 1 });
  // 今日饮食运动
  db.prepare("INSERT INTO diet_logs (user_id,date,meal,name,qty,unit,calories,created_at) VALUES (?,?,'breakfast','鸡蛋',2,'个',156,?)").run(uid, TODAY, new Date().toISOString());
  db.prepare("INSERT INTO diet_logs (user_id,date,meal,name,qty,unit,calories,created_at) VALUES (?,?,'breakfast','牛奶',250,'g',163,?)").run(uid, TODAY, new Date().toISOString());
  db.prepare("INSERT INTO diet_logs (user_id,date,meal,name,qty,unit,calories,created_at) VALUES (?,?,'lunch','轻食鸡胸套餐',1,'份',480,?)").run(uid, TODAY, new Date().toISOString());
  db.prepare("INSERT INTO exercise_logs (user_id,date,activity,minutes,calories,created_at) VALUES (?,?,'慢跑(8km/h)',35,311,?)").run(uid, TODAY, new Date().toISOString());
}

// ---------- 2. 阿香：14 天，1 成功周 + 本周进行中 ----------
wipe('demo2');
{
  const uid = mkUser('demo2', '阿香', 'female', 162, 1995, 95);
  const start = addDays(TODAY, -14);
  buildHistory({ uid, days: 14, slope: 0.085, base: 60.2 });
  const p = mkPledge(uid, 60.2, start, 55, 0.5, 50, '转给闺蜜让她买奶茶');
  const ws1 = isoWeekStart(addDays(TODAY, -7));
  const st1 = trendAt(uid, ws1);
  mkContract(p, uid, ws1, 1, st1, round1(st1 - 0.5), 'success');
  addEvent(uid, 'contract_success', { week_no: 1, delta: round1(st1 - trendAt(uid, addDays(ws1, 6))), target: round1(st1 - 0.5) });
  const wsNow = isoWeekStart(TODAY);
  mkContract(p, uid, wsNow, 2, trendAt(uid, wsNow), round1(trendAt(uid, wsNow) - 0.5), 'active');
  addEvent(uid, 'pledge_created', { target_weight: 55, weeks: 13, stake_per_week: 50 });
  addEvent(uid, 'checkin', { weight: trendAt(uid, TODAY), trend: round1(trendAt(uid, TODAY)), streak: streakOf(uid) });
}

// ---------- 3. 老K：上周翻车（掉秤不够+漏称），罚金待缴 ¥100 ----------
wipe('demo3');
{
  const uid = mkUser('demo3', '老K', 'male', 180, 1985, 70);
  const start = addDays(TODAY, -12);
  buildHistory({
    uid, days: 12, slope: 0.01, base: 92.0,
    skipDates: [addDays(TODAY, -4), addDays(TODAY, -5)], // 上周漏称两天
  });
  const p = mkPledge(uid, 92.0, start, 82, 0.75, 100, '给公司下午茶基金');
  const ws1 = isoWeekStart(addDays(TODAY, -7));
  const st1 = trendAt(uid, ws1);
  mkContract(p, uid, ws1, 1, st1, round1(st1 - 0.75), 'failed', 2);
  addEvent(uid, 'contract_fail', { week_no: 1, need: 0.8, miss_days: 2, amount: 100 });
  db.prepare("INSERT INTO stake_payments (user_id,contract_id,amount,status,created_at) VALUES (?,?,100,'pending',?)")
    .run(uid, db.prepare('SELECT id FROM contracts WHERE user_id=? AND week_no=1').get(uid).id, `${addDays(TODAY, -1)}T22:00:00.000Z`);
  const wsNow = isoWeekStart(TODAY);
  mkContract(p, uid, wsNow, 2, trendAt(uid, wsNow), round1(trendAt(uid, wsNow) - 0.75), 'active');
  addEvent(uid, 'pledge_created', { target_weight: 82, weeks: 15, stake_per_week: 100 });
  addEvent(uid, 'checkin', { weight: trendAt(uid, TODAY), trend: round1(trendAt(uid, TODAY)), streak: streakOf(uid) });
}

// ---------- 好友关系：铁头娃 与 阿香、老K 互为好友 ----------
{
  const id = (u) => db.prepare('SELECT id FROM users WHERE username=?').get(u).id;
  const pairs = [['demo1', 'demo2'], ['demo2', 'demo1'], ['demo1', 'demo3'], ['demo3', 'demo1'], ['demo2', 'demo3'], ['demo3', 'demo2']];
  for (const [a, b] of pairs) {
    db.prepare("INSERT OR IGNORE INTO friends (user_id, friend_id, status, created_at) VALUES (?,?,'accepted',?)").run(id(a), id(b), new Date().toISOString());
  }
}

console.log('✓ 演示数据已生成：');
console.log('  demo1 / demo123456  铁头娃（30天连胜，信用满分）');
console.log('  demo2 / demo123456  阿香（稳步进行中）');
console.log('  demo3 / demo123456  老K（上周失守，罚金待缴）');
