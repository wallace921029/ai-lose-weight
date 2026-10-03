// HTTP 全链路冒烟：注册→立状→称重→饮食/运动→广场→罚金→见证人
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const PORT = 3997;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pofu-smoke-'));

test('HTTP 冒烟', async () => {
  const child = spawn(process.execPath, ['src/index.mjs'], {
    cwd: path.resolve(import.meta.dirname, '..'),
    env: { ...process.env, PORT: String(PORT), DATA_DIR, JWT_SECRET: 'smoke-secret', FOUNDER_USERNAME: '', FOUNDER_PASSWORD: '', INVITE_CODE: 'smoke-invite', AI_BASE_URL: '', AI_API_KEY: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stdout.on('data', (d) => (logs += d));
  child.stderr.on('data', (d) => (logs += d));

  // 等服务就绪
  let up = false;
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) { up = true; break; }
    } catch { /* retry */ }
    await new Promise((res) => setTimeout(res, 100));
  }
  assert.ok(up, `server didn't start. logs:\n${logs}`);

  const j = (token) => ({
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  });
  const post = async (p, body, token) => {
    const r = await fetch(`${BASE}/api${p}`, { method: 'POST', headers: j(token), body: JSON.stringify(body ?? {}) });
    return { status: r.status, data: await r.json() };
  };
  const get = async (p, token) => {
    const r = await fetch(`${BASE}/api${p}`, { headers: j(token) });
    return { status: r.status, data: await r.json() };
  };

  try {
    // 未登录拦截
    assert.equal((await get('/today', null)).status, 401);

    // 注册 & 登录
    let r = await post('/auth/register', { username: 'wallace', password: 'secret6', nickname: '老王', inviteCode: 'smoke-invite' });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const t1 = r.data.token;
    assert.equal((await post('/auth/login', { username: 'wallace', password: 'wrong123' })).status, 400);
    assert.equal((await post('/auth/login', { username: 'wallace', password: 'secret6' })).status, 200);

    // 第二个用户（见证人）
    r = await post('/auth/register', { username: 'witness', password: 'secret6', inviteCode: 'smoke-invite' });
    const t2 = r.data.token;

    // bootstrap：无军令状
    let boot = (await get('/bootstrap', t1)).data;
    assert.equal(boot.hasPledge, false);

    // 未称重不能立状
    r = await post('/pledge', { target_weight: 70, deadline: '2030-01-01', weekly_pace: 0.5, stake_per_week: 50 }, t1);
    assert.equal(r.status, 400);

    // 称重
    r = await post('/weigh', { weight_kg: 80.2, note: '晨重' }, t1);
    assert.equal(r.status, 200);
    assert.equal(r.data.weighed, true);
    assert.ok(r.data.trend > 80 && r.data.trend < 80.4);

    // 立状（含见证人）
    const deadline = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
    r = await post('/pledge', {
      target_weight: 72, deadline, weekly_pace: 0.5, stake_per_week: 50,
      punishment_desc: '捐给公益基金', witnesses: ['witness'],
    }, t1);
    assert.equal(r.status, 200, JSON.stringify(r.data));

    // 重复立状被拒
    r = await post('/pledge', { target_weight: 70, deadline, weekly_pace: 0.5 }, t1);
    assert.equal(r.status, 400);

    // today 聚合（首周目标按剩余天数等比折算）
    let today = (await get('/today', t1)).data;
    assert.ok(today.contract, '本周契约应已创建');
    const { isoWeekStart, addDays: ad, diffDays: dd, todayStr: td } = await import('../src/util.mjs');
    const ws = isoWeekStart(td());
    const effDays = Math.min(7, Math.max(1, dd(td(), ad(ws, 6)) + 1));
    assert.equal(today.contract.target_weight, Math.round((80.2 - 0.5 * (effDays / 7)) * 10) / 10);
    assert.ok(today.calorie.budget > 1200 && today.calorie.budget < 3000);
    assert.ok(today.coach.length > 0);

    // 饮食 & 运动
    r = await post('/diet', { meal: 'breakfast', name: '鸡蛋', qty: 2, unit: '个', calories: 156 }, t1);
    assert.equal(r.status, 200);
    const dietId = r.data.id;
    r = await post('/exercise', { activity: '快走', minutes: 40 }, t1);
    assert.equal(r.status, 200);
    assert.ok(r.data.calories > 80);

    today = (await get('/today', t1)).data;
    assert.equal(today.calorie.intake, 156);
    assert.ok(today.calorie.burned > 80);

    const logs = (await get(`/logs?date=${today.date}`, t1)).data;
    assert.equal(logs.diet.length, 1);
    assert.equal(logs.exercise.length, 1);

    // 删除饮食
    assert.equal((await fetch(`${BASE}/api/diet/${dietId}`, { method: 'DELETE', headers: j(t1) })).status, 200);

    // 体重曲线
    const w = (await get('/weights?days=7', t1)).data;
    assert.equal(w.points.length, 1);

    // 见证人已下线：路由移除，/pledge 不再返回 witnesses
    assert.equal((await post('/witnesses', { username: 'witness' }, t1)).status, 404);
    const pl = (await get('/pledge', t1)).data;
    assert.equal(pl.witnesses, undefined);

    // 广场：包含 wallace 的打卡/立状事件
    const sq = (await get('/square', t2)).data;
    const types = sq.events.map((e) => e.type);
    assert.ok(types.includes('checkin'));
    assert.ok(types.includes('pledge_created'));
    // 打卡事件不泄漏绝对体重
    const ck = sq.events.filter((e) => e.type === 'checkin');
    assert.ok(ck.every((e) => e.payload.weight === undefined && e.payload.delta !== undefined));

    // 排行榜
    const lb = (await get('/leaderboard', t1)).data;
    assert.equal(lb.total, 2);
    assert.ok(lb.myRank >= 1);

    // 食物/运动字典
    const foods = (await get('/foods?q=鸡', t1)).data.foods;
    assert.ok(foods.length > 0);
    const exs = (await get('/exercises', t1)).data.exercises;
    assert.ok(exs.length > 10);

    // profile 更新
    r = await fetch(`${BASE}/api/profile`, {
      method: 'PUT', headers: j(t1), body: JSON.stringify({ height_cm: 178, nickname: '狠人老王' }),
    });
    assert.equal(r.status, 200);

    // 坏 token
    assert.equal((await get('/today', 'bad-token')).status, 401);

    // SPA 回退
    const spa = await fetch(`${BASE}/contract`);
    assert.equal(spa.status, 200);
  } catch (e) {
    console.error('server logs:\n' + logs);
    throw e;
  } finally {
    child.kill('SIGTERM');
  }
});
