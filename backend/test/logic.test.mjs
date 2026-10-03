import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pofu-logic-'));

const { db } = await import('../src/db.mjs');
const { settleUser, recomputeTrends, streakOf } = await import('../src/logic.mjs');
const { addDays, todayStr, isoWeekStart, diffDays } = await import('../src/util.mjs');

const TODAY = todayStr();

function mkUser(name) {
  db.prepare(
    "INSERT INTO users (username,password_hash,nickname,gender,birth_year,height_cm,activity,credit,created_at) VALUES (?,?,?,'male',1990,175,1.375,100,?)"
  ).run(name, 'x', name, new Date().toISOString());
  return Number(db.prepare('SELECT last_insert_rowid() AS id').get().id);
}

function w2(uid, date, kg) {
  db.prepare(
    'INSERT INTO weigh_ins (user_id,date,weight_kg,trend,note,created_at) VALUES (?,?,?,?,?,?)'
  ).run(uid, date, kg, kg, '', new Date().toISOString());
}

function mkPledge(uid, startWeight, startDate, target, stake = 0) {
  const info = db.prepare(
    "INSERT INTO pledges (user_id,start_weight,start_date,target_weight,deadline,weekly_pace,stake_per_week,punishment_desc,status,created_at) VALUES (?,?,?,?,?,?,?,?, 'active', ?)"
  ).run(uid, startWeight, startDate, target, addDays(TODAY, 60), 0.5, stake, '测试罚则', new Date().toISOString());
  return Number(info.lastInsertRowid);
}

function mkContract(pledgeId, uid, weekStart, weekNo, startTrend, target, expected = 7) {
  const info = db.prepare(
    "INSERT INTO contracts (pledge_id,user_id,week_no,week_start,week_end,expected_days,start_trend,target_weight,status,created_at) VALUES (?,?,?,?,?,?,?,?,'active',?)"
  ).run(pledgeId, uid, weekNo, weekStart, addDays(weekStart, 6), expected, startTrend, target, new Date().toISOString());
  return Number(info.lastInsertRowid);
}

const contractsOf = (uid) => db.prepare('SELECT * FROM contracts WHERE user_id=? ORDER BY week_no').all(uid);
const creditOf = (uid) => db.prepare('SELECT credit FROM users WHERE id=?').get(uid).credit;

test('周契约：达标 → success，信用 +5', () => {
  const uid = mkUser('win_user');
  db.prepare('UPDATE users SET credit=90 WHERE id=?').run(uid);
  const ws = addDays(isoWeekStart(TODAY), -14); // 上上周周一
  for (let d = 0; d < 15; d++) w2(uid, addDays(ws, d), 80 - d); // 每天 -1kg，必达标
  recomputeTrends(uid);
  const p = mkPledge(uid, 80, ws, 70);
  mkContract(p, uid, ws, 1, 80, 79.5);
  mkContract(p, uid, addDays(ws, 7), 2, 79.5, 79);
  settleUser(uid);
  const cs = contractsOf(uid);
  assert.equal(cs[0].status, 'success');
  assert.equal(cs[1].status, 'success');
  assert.equal(creditOf(uid), 100);
});

test('周契约：不掉秤 → failed + 罚金 pending + 信用 -15', () => {
  const uid = mkUser('fail_user');
  const ws = addDays(isoWeekStart(TODAY), -7); // 上周
  for (let d = 0; d < 8; d++) w2(uid, addDays(ws, d), 80); // 纹丝不动
  recomputeTrends(uid);
  const p = mkPledge(uid, 80, ws, 70, 100);
  mkContract(p, uid, ws, 1, 80, 79.5);
  settleUser(uid);
  const cs = contractsOf(uid);
  assert.equal(cs[0].status, 'failed');
  assert.equal(creditOf(uid), 85);
  const st = db.prepare("SELECT * FROM stake_payments WHERE user_id=?").all(uid);
  assert.equal(st.length, 1);
  assert.equal(st[0].status, 'pending');
  assert.equal(st[0].amount, 100);
});

test('周契约：漏称 ≥3 天 → 即使达标也判失败', () => {
  const uid = mkUser('miss_user');
  const ws = addDays(isoWeekStart(TODAY), -7);
  // 只称 2 天
  w2(uid, ws, 80);
  w2(uid, addDays(ws, 6), 75);
  recomputeTrends(uid);
  const p = mkPledge(uid, 80, ws, 70);
  mkContract(p, uid, ws, 1, 80, 79.5);
  settleUser(uid);
  assert.equal(contractsOf(uid)[0].status, 'failed');
  assert.equal(contractsOf(uid)[0].miss_days, 5);
});

test('本周契约自动创建，目标 = 当前趋势 - 周配速×(实际天数/7)', () => {
  const uid = mkUser('cur_user');
  w2(uid, TODAY, 80);
  recomputeTrends(uid);
  mkPledge(uid, 80, TODAY, 70);
  settleUser(uid);
  const cs = contractsOf(uid);
  assert.equal(cs.length, 1);
  assert.equal(cs[0].status, 'active');
  const ws = isoWeekStart(TODAY);
  assert.equal(cs[0].week_start, ws);
  // 期望：从立状日(今天)到本周日的天数，按比例折算目标
  const expected = diffDays(TODAY, addDays(ws, 6)) + 1;
  assert.equal(cs[0].expected_days, expected);
  assert.equal(cs[0].target_weight, Math.round((80 - 0.5 * (expected / 7)) * 10) / 10);
});

test('军令状到期：达标 → completed + 信用 +20', () => {
  const uid = mkUser('final_win');
  db.prepare('UPDATE users SET credit=80 WHERE id=?').run(uid);
  const start = addDays(TODAY, -30);
  for (let d = 0; d <= 30; d++) w2(uid, addDays(start, d), 80 - d * 0.3);
  recomputeTrends(uid);
  const info = db.prepare(
    "INSERT INTO pledges (user_id,start_weight,start_date,target_weight,deadline,weekly_pace,stake_per_week,status,created_at) VALUES (?,?,?,?,?,?,?,'active',?)"
  ).run(uid, 80, start, 74, addDays(TODAY, -1), 0.5, 0, new Date().toISOString());
  void info;
  settleUser(uid);
  const p = db.prepare('SELECT * FROM pledges WHERE user_id=?').get(uid);
  assert.equal(p.status, 'completed');
  assert.equal(creditOf(uid), 100);
});

test('连续打卡：从今天/昨天回溯', () => {
  const uid = mkUser('streak_user');
  w2(uid, addDays(TODAY, -3), 80);
  w2(uid, addDays(TODAY, -2), 80);
  w2(uid, addDays(TODAY, -1), 80);
  assert.equal(streakOf(uid), 3); // 今天没称不算断
  w2(uid, TODAY, 80);
  assert.equal(streakOf(uid), 4);
});

test('趋势线：EWMA 收敛于真实值', () => {
  const uid = mkUser('trend_user');
  w2(uid, addDays(TODAY, -4), 80);
  w2(uid, addDays(TODAY, -3), 80);
  w2(uid, addDays(TODAY, -2), 80);
  w2(uid, addDays(TODAY, -1), 90); // 一次性暴增（水重）
  w2(uid, TODAY, 80);
  const t = recomputeTrends(uid);
  assert.ok(t < 82 && t > 79, `trend=${t} 应接近 80 而非被单日 90 带偏`);
});
