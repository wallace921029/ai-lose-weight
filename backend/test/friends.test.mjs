// 好友系统 + 每日攀比榜（隐私字段断言）
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = 3991;

function startBackend() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pofu-friends-'));
  const child = spawn(process.execPath, ['src/index.mjs'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), JWT_SECRET: 'friends-test', DATA_DIR: dir, FOUNDER_USERNAME: '', FOUNDER_PASSWORD: '', INVITE_CODE: 'friends-invite' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stdout.on('data', (d) => (logs += d));
  child.stderr.on('data', (d) => (logs += d));
  return { child, logs };
}

async function waitUp() {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/api/health`);
      if (r.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('backend not up');
}

test('好友：申请/同意/攀比榜/删除 + 隐私保护', async () => {
  const { child, logs } = startBackend();
  try {
    await waitUp();
    const j = (token) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` });
    const post = async (p, body, token) => {
      const r = await fetch(`http://127.0.0.1:${PORT}/api${p}`, { method: 'POST', headers: j(token), body: JSON.stringify(body ?? {}) });
      return { status: r.status, data: await r.json() };
    };
    const get = async (p, token) => (await fetch(`http://127.0.0.1:${PORT}/api${p}`, { headers: j(token) })).json();

    const { token: t1 } = (await post('/auth/register', { username: 'f1', password: 'secret6', nickname: '攀比一号', inviteCode: 'friends-invite' })).data;
    const { token: t2 } = (await post('/auth/register', { username: 'f2', password: 'secret6', nickname: '攀比二号', inviteCode: 'friends-invite' })).data;
    const { token: t3 } = (await post('/auth/register', { username: 'f3', password: 'secret6', inviteCode: 'friends-invite' })).data;

    // 1 申请与同意
    assert.equal((await post('/friends', { username: 'f2' }, t1)).status, 200);
    // 重复申请被拒
    const dup = await post('/friends', { username: 'f2' }, t1);
    assert.equal(dup.status, 400);
    assert.equal(dup.data.error, '申请已发送，等对方处理');
    // 对方视角：收到申请
    let fl2 = await get('/friends', t2);
    assert.equal(fl2.requestsIn.length, 1);
    assert.equal(fl2.requestsIn[0].username, 'f1');
    // 同意
    assert.equal((await post(`/friends/${fl2.requestsIn[0].id}/accept`, {}, t2)).status, 200);
    // 双方好友列表各 +1
    let fl1 = await get('/friends', t1);
    fl2 = await get('/friends', t2);
    assert.equal(fl1.friends.length, 1);
    assert.equal(fl2.friends.length, 1);
    // 已是好友再申请被拒
    assert.equal((await post('/friends', { username: 'f2' }, t1)).data.error, '你们已经是好友了');

    // 2 反向待申请自动成交
    await post('/friends', { username: 'f3' }, t1); // f1 -> f3 pending
    const auto = await post('/friends', { username: 'f1' }, t3); // f3 -> f1，应自动成为好友
    assert.equal(auto.data.autoAccepted, true);
    const fl3 = await get('/friends', t3);
    assert.equal(fl3.friends.length, 1);

    // 3 攀比榜：f1 称重+运动，f2 什么都没做
    await post('/weigh', { weight_kg: 88.8 }, t1);
    await post('/exercise', { activity: '快走', minutes: 40 }, t1);
    const board = await get('/friends/board', t1);
    assert.equal(board.items.length, 3); // 我 + f2 + f3
    const me = board.items.find((i) => i.isMe);
    const f2item = board.items.find((i) => i.username === 'f2');
    assert.equal(me.weighed, true);
    assert.equal(me.exerciseMin, 40);
    assert.ok(me.streak >= 1);
    assert.equal(f2item.weighed, false);
    assert.equal(f2item.exerciseMin, 0);
    assert.equal(f2item.week, null); // 未立状
    assert.equal(f2item.calorieOk, null);
    // 排序：streak 降序，我在最前
    assert.equal(board.items[0].isMe, true);

    // 4 隐私断言：榜里绝不能出现体重/趋势/热量数值
    const boardStr = JSON.stringify(board);
    assert.ok(!/"weight|trend|calorie":\s*\d|intake|burned/.test(boardStr), `隐私泄露: ${boardStr}`);

    // 5 广场好友范围：f2 能看到 f1 的打卡事件，未加好友的 f3 看不到 f2 的
    const sqF2 = await get('/square?scope=friends', t2);
    assert.ok(sqF2.events.some((e) => e.type === 'checkin' && e.user.username === 'f1'));
    const sqF3 = await get('/square?scope=friends', t3);
    assert.ok(!sqF3.events.some((e) => e.user.username === 'f2'));

    // 6 删除好友（双向）
    const rowId = fl1.friends.find((f) => f.username === 'f2').row_id;
    assert.equal((await fetch(`http://127.0.0.1:${PORT}/api/friends/${rowId}`, { method: 'DELETE', headers: j(t1) })).status, 200);
    assert.equal((await get('/friends', t1)).friends.length, 1);
    assert.equal((await get('/friends', t2)).friends.length, 0);
    void logs;
  } finally {
    child.kill('SIGTERM');
    await new Promise((r) => child.on('exit', r));
  }
});
