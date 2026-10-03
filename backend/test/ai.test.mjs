// AI 对接端到端测试：本地起一个 OpenAI 兼容的 mock 服务，验证
// 创始人全局配置（对话/TTS/ASR）→ 教练/解析/合成/识别 全链路，以及邀请码注册、权限边界、降级路径。
// 注意：后端会加载仓库根目录 .env，startBackend 里显式清空相关变量保证测试确定性。
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import http from 'node:http';

const ROOT = path.resolve(import.meta.dirname, '..');
const KEY = 'test-key-12345678';

function mockLLM() {
  const server = http.createServer((req, res) => {
    const authed = (req.headers.authorization || '') === `Bearer ${KEY}`;
    if (req.method === 'GET' && req.url.endsWith('/models')) {
      if (!authed) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Invalid API key' }));
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ object: 'list', data: [{ id: 'deepseek-chat' }, { id: 'deepseek-reasoner' }] }));
    }
    if (req.method === 'POST' && req.url.endsWith('/audio/speech')) {
      if (!authed) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Invalid API key' }));
      }
      res.writeHead(200, { 'Content-Type': 'audio/mpeg' });
      return res.end(Buffer.from('fake-mp3-bytes'));
    }
    if (req.method === 'POST' && req.url.endsWith('/audio/transcriptions')) {
      if (!authed) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Invalid API key' }));
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ text: '慢跑三十分钟' }));
    }
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const payload = JSON.parse(body);
      const sys = payload.messages[0]?.content || '';
      let content = 'AI教练简报：数据我看过了，今晚十点后别进食。';
      if (sys.includes('指令路由器')) {
        const u = payload.messages[1]?.content || '';
        const today = new Date().toISOString().slice(0, 10);
        let intent = { type: 'chat' };
        if (u.includes('65千克')) intent = { type: 'weigh', weight_kg: 65, date: today };
        else if (u.includes('牛肉面')) {
          intent = { type: 'diet', date: today, items: [{ name: '五香牛肉面', meal: 'lunch', qty: 1, unit: '碗', calories: 550 }] };
        } else if (u.includes('跑了')) {
          intent = { type: 'exercise', date: today, items: [{ activity: '慢跑(8km/h)', minutes: 35 }] };
        }
        content = JSON.stringify(intent);
      } else if (sys.includes('饮食记录解析器')) {
        content = JSON.stringify([
          { name: '牛肉面', meal: 'lunch', qty: 1, unit: '碗', calories: 680 },
          { name: '卤蛋', meal: 'lunch', qty: 1, unit: '个', calories: 70 },
        ]);
      } else if (sys.includes('运动记录解析器')) {
        content = JSON.stringify([{ activity: '慢跑(8km/h)', minutes: 35 }, { activity: '跳绳', minutes: 20 }]);
      } else if (sys.includes('对话')) {
        content = '少废话，先把手边的零食扔了。';
      }
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ choices: [{ message: { content } }] }));
    });
  });
  return new Promise((resolve) => server.listen(3996, () => resolve(server)));
}

function startBackend(port, env = {}) {
  const child = spawn(process.execPath, ['src/index.mjs'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      JWT_SECRET: 'ai-test',
      // 清掉可能来自 shell 或根目录 .env 的配置，避免污染测试
      FOUNDER_USERNAME: '', FOUNDER_PASSWORD: '', INVITE_CODE: '',
      AI_BASE_URL: '', AI_API_KEY: '', AI_MODEL: '', DEEPSEEK_BASE_URL: '',
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stdout.on('data', (d) => (logs += d));
  child.stderr.on('data', (d) => (logs += d));
  return { child, logs };
}

async function waitUp(port) {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (r.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('backend not up');
}

const stopped = (child) => new Promise((r) => child.on('exit', r));

function client(port) {
  const j = (token) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` });
  return {
    j,
    post: async (p, body, token) => (await fetch(`http://127.0.0.1:${port}/api${p}`, { method: 'POST', headers: j(token), body: JSON.stringify(body) })),
    get: async (p, token) => (await fetch(`http://127.0.0.1:${port}/api${p}`, { headers: j(token) })),
    put: async (p, body, token) => (await fetch(`http://127.0.0.1:${port}/api${p}`, { method: 'PUT', headers: j(token), body: JSON.stringify(body) })),
    del: async (p, token) => (await fetch(`http://127.0.0.1:${port}/api${p}`, { method: 'DELETE', headers: j(token) })),
  };
}

test('创始人全局配置：对话 / TTS / ASR 全链路 + 邀请码 + 权限', async () => {
  const mock = await mockLLM();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pofu-ai-'));
  const { child } = startBackend(3994, {
    DATA_DIR: dir,
    FOUNDER_USERNAME: 'boss', FOUNDER_PASSWORD: 'boss-secret-6',
    INVITE_CODE: 'POFU-TEST,备用码',
  });
  try {
    await waitUp(3994);
    const c = client(3994);

    // ---- 邀请码注册 ----
    const noCode = await (await c.post('/auth/register', { username: 'm0', password: 'secret6' })).json();
    assert.equal(noCode.error, '邀请码不对，找创始人要一个');
    const badCode = await (await c.post('/auth/register', { username: 'm0', password: 'secret6', inviteCode: 'wrong' })).json();
    assert.equal(badCode.error, '邀请码不对，找创始人要一个');
    const dupName = await (await c.post('/auth/register', { username: 'boss', password: 'secret6', inviteCode: 'pofu-test' })).json();
    assert.equal(dupName.error, '用户名已被占用');
    const ok = await (await c.post('/auth/register', { username: 'member1', password: 'secret6', inviteCode: 'pofu-test' })).json();
    const memberToken = ok.token; // 大小写不敏感
    await c.post('/weigh', { weight_kg: 80 }, memberToken);

    // ---- 创始人登录（.env 账号）----
    const login = await (await c.post('/auth/login', { username: 'boss', password: 'boss-secret-6' })).json();
    const bossToken = login.token;
    const boot = await (await c.get('/bootstrap', bossToken)).json();
    assert.equal(boot.user.role, 'founder');
    const mBoot = await (await c.get('/bootstrap', memberToken)).json();
    assert.equal(mBoot.user.role, 'member');

    // ---- 权限：普通用户不能碰配置 ----
    assert.equal((await c.put('/ai/settings', { slot: 'chat', provider: 'deepseek', model: 'deepseek-chat' }, memberToken)).status, 403);
    assert.equal((await c.put('/ai/providers/deepseek', { apiKey: KEY, baseUrl: 'http://127.0.0.1:3996/v1' }, memberToken)).status, 403);
    assert.equal((await c.get('/ai/providers/deepseek/models', memberToken)).status, 403);
    assert.equal((await c.del('/ai/settings/chat', memberToken)).status, 403);

    // ---- 未配置时降级 ----
    const st0 = await (await c.get('/ai-status')).json();
    assert.equal(st0.enabled, false);
    assert.equal(st0.tts, false);
    const coach0 = await (await c.get('/coach', memberToken)).json();
    assert.equal(coach0.ai, false);
    assert.equal((await c.post('/coach/chat', { messages: [{ role: 'user', content: 'hi' }] }, memberToken)).status, 503);
    assert.equal((await c.post('/ai/tts', { text: '加油' }, memberToken)).status, 503);

    // ---- 第一步：配置服务商（DeepSeek，指向本地 mock）----
    const MOCK = 'http://127.0.0.1:3996/v1';
    const providers0 = await (await c.get('/ai/providers', bossToken)).json();
    assert.equal(providers0.providers.length, 6);
    assert.equal(providers0.providers.find((p) => p.id === 'deepseek').configured, false);
    // 未配凭证时不能拉模型，也不能给能力分配该厂商
    assert.equal((await (await c.get('/ai/providers/deepseek/models', bossToken)).json()).error, '先配置这家服务商的 API Key');
    assert.ok(((await (await c.put('/ai/settings', { slot: 'chat', provider: 'deepseek', model: 'deepseek-chat' }, bossToken)).json()).error || '').includes('先在「服务商」里配置'));
    // 错误 Key 被上游拒绝
    const badKey = await (await c.put('/ai/providers/deepseek', { apiKey: 'wrong-key', baseUrl: MOCK }, bossToken)).json();
    assert.ok((badKey.error || '').includes('API Key 无效'));
    // 正确 Key 保存成功
    const cred = await (await c.put('/ai/providers/deepseek', { apiKey: KEY, baseUrl: MOCK }, bossToken)).json();
    assert.equal(cred.ok, true);
    assert.equal(cred.maskedKey, 'tes***5678');
    // 凭证状态合并进注册表
    const providers1 = await (await c.get('/ai/providers', bossToken)).json();
    const dp = providers1.providers.find((p) => p.id === 'deepseek');
    assert.equal(dp.configured, true);
    assert.equal(dp.maskedKey, 'tes***5678');
    assert.equal(dp.baseUrlUsed, MOCK);
    // 用已存凭证拉模型列表
    const ml = await (await c.get('/ai/providers/deepseek/models', bossToken)).json();
    assert.deepEqual(ml.models, ['deepseek-chat', 'deepseek-reasoner']);

    // ---- 第二步：能力分配（对话 → DeepSeek）----
    const save = await (await c.put('/ai/settings', { slot: 'chat', provider: 'deepseek', model: 'deepseek-chat' }, bossToken)).json();
    assert.equal(save.ok, true);
    assert.equal(save.maskedKey, 'tes***5678');
    // 保存不存在的模型被拒
    const badModel = await (await c.put('/ai/settings', { slot: 'chat', provider: 'deepseek', model: 'gpt-99' }, bossToken)).json();
    assert.ok((badModel.error || '').includes('不在'));

    // ---- 普通用户看到的脱敏状态 + 教练走 AI ----
    const st = await (await c.get('/ai/settings', memberToken)).json();
    assert.equal(st.role, 'member');
    assert.equal(st.chat.enabled, true);
    assert.equal(st.chat.providerName, 'DeepSeek');
    assert.equal(st.chat.maskedKey, 'tes***5678');
    const coach1 = await (await c.get('/coach', memberToken)).json();
    assert.equal(coach1.ai, true);
    assert.ok(coach1.text.includes('AI教练简报'));
    const chat = await (await c.post('/coach/chat', { messages: [{ role: 'user', content: '我饿了' }] }, memberToken)).json();
    assert.ok(chat.reply.includes('零食'));
    const parsed = await (await c.post('/diet/parse', { text: '中午吃了一碗牛肉面和一个卤蛋' }, memberToken)).json();
    assert.equal(parsed.items.length, 2);
    const xp = await (await c.post('/exercise/parse', { text: '跑了五公里大概三十五分钟，还跳了二十分钟绳' }, memberToken)).json();
    assert.equal(xp.items[0].activity, '慢跑(8km/h)');

    // ---- 教练指令：意图分流 → 卡片确认 → 入库闭环 ----
    // 记体重 → action
    const wCmd = await (await c.post('/coach/command', { text: '帮我记录下体重，65千克' }, memberToken)).json();
    assert.equal(wCmd.kind, 'action');
    assert.equal(wCmd.action.type, 'weigh');
    assert.equal(wCmd.action.weight_kg, 65);
    // 前端确认后走既有入库接口
    assert.equal((await c.post('/weigh', { weight_kg: wCmd.action.weight_kg }, memberToken)).status, 200);
    // 记饮食 → action（带清洗后的条目）
    const dCmd = await (await c.post('/coach/command', { text: '我今天中午吃了一碗五香牛肉面，帮我记录一下' }, memberToken)).json();
    assert.equal(dCmd.kind, 'action');
    assert.equal(dCmd.action.type, 'diet');
    assert.equal(dCmd.action.items[0].name, '五香牛肉面');
    assert.equal(dCmd.action.items[0].meal, 'lunch');
    assert.equal((await c.post('/diet', { date: dCmd.action.date, ...dCmd.action.items[0] }, memberToken)).status, 200);
    // 记运动 → action（活动名回落运动库 + 算好消耗）
    const eCmd = await (await c.post('/coach/command', { text: '傍晚跑了三十五分钟' }, memberToken)).json();
    assert.equal(eCmd.kind, 'action');
    assert.equal(eCmd.action.type, 'exercise');
    assert.equal(eCmd.action.items[0].activity, '慢跑(8km/h)');
    assert.ok(eCmd.action.items[0].calories > 100);
    assert.equal((await c.post('/exercise', { date: eCmd.action.date, activity: eCmd.action.items[0].activity, minutes: eCmd.action.items[0].minutes }, memberToken)).status, 200);
    // 闲聊 → chat（走教练人设回复）
    const chatCmd = await (await c.post('/coach/command', { text: '这周还有救吗？' }, memberToken)).json();
    assert.equal(chatCmd.kind, 'chat');
    assert.ok((chatCmd.reply || '').length > 0);
    // 体重越界 → 教练口吻拒绝
    const badW = await (await c.post('/coach/command', { text: '记体重 5千克' }, memberToken)).json();
    assert.equal(badW.kind, 'chat');

    // ---- 配置 TTS/ASR：先加服务商凭证，再分配能力（可跨厂商）----
    assert.equal((await (await c.put('/ai/providers/bailian', { apiKey: KEY, baseUrl: MOCK }, bossToken)).json()).ok, true);
    const saveTts = await (await c.put('/ai/settings', { slot: 'tts', provider: 'bailian', model: 'cosyvoice-v2', voice: 'longxiaochun' }, bossToken)).json();
    assert.equal(saveTts.ok, true);
    const ttsRes = await c.post('/ai/tts', { text: '今晚十点后别进食' }, memberToken);
    assert.equal(ttsRes.status, 200);
    assert.equal(ttsRes.headers.get('content-type'), 'audio/mpeg');
    const ttsBuf = Buffer.from(await ttsRes.arrayBuffer());
    assert.ok(ttsBuf.length > 0);
    const stTts = await (await c.get('/ai-status')).json();
    assert.equal(stTts.tts, true);
    const coach2 = await (await c.get('/coach', memberToken)).json();
    assert.equal(coach2.tts, true);

    assert.equal((await (await c.put('/ai/providers/bigmodel', { apiKey: KEY, baseUrl: MOCK }, bossToken)).json()).ok, true);
    const saveAsr = await (await c.put('/ai/settings', { slot: 'asr', provider: 'bigmodel', model: 'glm-asr' }, bossToken)).json();
    assert.equal(saveAsr.ok, true);
    const asrRes = await fetch('http://127.0.0.1:3994/api/ai/asr', {
      method: 'POST',
      headers: { Authorization: `Bearer ${memberToken}`, 'Content-Type': 'audio/webm' },
      body: Buffer.from('fake-webm-opus-audio'),
    });
    assert.equal(asrRes.status, 200);
    assert.equal((await asrRes.json()).text, '慢跑三十分钟');
    assert.equal((await (await c.get('/ai-status')).json()).asr, true);

    // ---- 删除服务商凭证 → 引用它的能力级联清空 ----
    const delBailian = await (await c.del('/ai/providers/bailian', bossToken)).json();
    assert.deepEqual(delBailian.clearedSlots, ['tts']);
    assert.equal((await (await c.get('/ai-status')).json()).tts, false);
    // deepseek 凭证还在 → chat 不受影响
    assert.equal((await (await c.get('/ai-status')).json()).enabled, true);
    // 清掉对话能力 → 教练降级（本实例无环境变量兜底）
    await c.del('/ai/settings/chat', bossToken);
    const coach3 = await (await c.get('/coach', memberToken)).json();
    assert.equal(coach3.ai, false);
  } finally {
    child.kill('SIGTERM');
    await stopped(child);
    mock.close();
  }
});

test('环境变量兜底 + 未配置邀请码时注册关闭', async () => {
  const mock = await mockLLM();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pofu-envai-'));
  const { child } = startBackend(3993, {
    DATA_DIR: dir,
    INVITE_CODE: 'env-code',
    AI_BASE_URL: 'http://127.0.0.1:3996/v1', AI_API_KEY: KEY,
  });
  try {
    await waitUp(3993);
    const c = client(3993);
    const st = await (await c.get('/ai-status')).json();
    assert.equal(st.enabled, true);
    assert.equal(st.model, 'glm-4-flash'); // 环境变量未指定模型时的默认

    const reg = await (await c.post('/auth/register', { username: 'env_user', password: 'secret6', inviteCode: 'env-code' })).json();
    await c.post('/weigh', { weight_kg: 80 }, reg.token);
    const coach = await (await c.get('/coach', reg.token)).json();
    assert.equal(coach.ai, true);
    const stUser = await (await c.get('/ai/settings', reg.token)).json();
    assert.equal(stUser.chat.providerName, '服务器环境变量');

    // 普通用户依旧不能改配置（即便来源是环境变量）
    assert.equal((await c.put('/ai/settings', { slot: 'chat', provider: 'deepseek', apiKey: KEY, model: 'deepseek-chat' }, reg.token)).status, 403);
  } finally {
    child.kill('SIGTERM');
    await stopped(child);
    mock.close();
  }
});

test('教练指令上游故障：502 + 具体错误信息透传（前端提示、输入不丢）', async () => {
  // 一个永远 500 的假上游
  const bad = http.createServer((req, res) => {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'boom' }));
  });
  await new Promise((r) => bad.listen(3995, r));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pofu-badai-'));
  const { child } = startBackend(3989, {
    DATA_DIR: dir,
    INVITE_CODE: 'bad-code',
    AI_BASE_URL: 'http://127.0.0.1:3995/v1', AI_API_KEY: 'whatever-key',
  });
  try {
    await waitUp(3989);
    const c = client(3989);
    const { token } = await (await c.post('/auth/register', { username: 'bad_user', password: 'secret6', inviteCode: 'bad-code' })).json();
    await c.post('/weigh', { weight_kg: 70 }, token);
    // 指令：意图路由直接打上游 500 → 502 + 透传 upstream 信息
    const cmd = await c.post('/coach/command', { text: '今天状态怎么样' }, token);
    assert.equal(cmd.status, 502);
    assert.ok(((await cmd.json()).error || '').includes('AI upstream 500'));
    // 传统对话接口同样透传
    const chat = await c.post('/coach/chat', { messages: [{ role: 'user', content: 'hi' }] }, token);
    assert.equal(chat.status, 502);
    assert.ok(((await chat.json()).error || '').includes('AI upstream 500'));
  } finally {
    child.kill('SIGTERM');
    await stopped(child);
    bad.close();
  }
});

test('未配置邀请码：注册关闭，创始人账号仍可登录', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pofu-noinvite-'));
  const { child } = startBackend(3992, {
    DATA_DIR: dir,
    FOUNDER_USERNAME: 'solo', FOUNDER_PASSWORD: 'solo-secret-6',
  });
  try {
    await waitUp(3992);
    const c = client(3992);
    const reg = await (await c.post('/auth/register', { username: 'x1', password: 'secret6', inviteCode: 'anything' })).json();
    assert.equal(reg.error, '注册未开放：服务器未配置邀请码');
    const login = await (await c.post('/auth/login', { username: 'solo', password: 'solo-secret-6' })).json();
    assert.ok(login.token);
    // 改密码：重启进程换密码后能登录（这里只验证引导幂等）
    assert.equal((await c.post('/auth/login', { username: 'solo', password: 'wrong-pass' })).status, 400);
  } finally {
    child.kill('SIGTERM');
    await stopped(child);
  }
});
