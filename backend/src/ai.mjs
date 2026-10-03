// AI 网关：全局模型配置由创始人统一管理（应用内配置，存 ai_global 表），
// 其次用服务器环境变量兜底（AI_BASE_URL/AI_API_KEY/AI_MODEL，任意 OpenAI 兼容服务商），
// 都没有则降级规则教练。三个能力（对话/TTS/ASR）各自独立配置。
import { db } from './db.mjs';

// ---------- 官方 Provider 注册表（baseUrl 可在配置时覆盖） ----------
export const PROVIDERS = [
  {
    id: 'bailian', name: '阿里云百炼', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', keyUrl: 'bailian.console.aliyun.com',
    keyHint: 'DashScope API Key（sk-…，bailian.console.aliyun.com）',
    ttsVoice: 'longxiaochun',
  },
  {
    id: 'moonshot', name: 'Moonshot Kimi', baseUrl: 'https://api.moonshot.cn/v1', keyUrl: 'platform.moonshot.cn',
    keyHint: 'Moonshot API Key（sk-…，platform.moonshot.cn）',
  },
  {
    id: 'bigmodel', name: '智谱 BigModel', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', keyUrl: 'open.bigmodel.cn',
    keyHint: 'BigModel API Key（…，open.bigmodel.cn）',
  },
  {
    id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', keyUrl: 'platform.deepseek.com',
    keyHint: 'DeepSeek API Key（sk-…，platform.deepseek.com）',
  },
  {
    id: 'volcano', name: '火山方舟', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', keyUrl: 'console.volcengine.com/ark',
    keyHint: '火山方舟 API Key（方舟控制台，模型可能需填接入点 ep-…）',
  },
  {
    id: 'mimo', name: '小米 MiMo', baseUrl: 'https://api.xiaomimimo.com/v1', keyUrl: 'mimo.mi.com',
    keyHint: 'MiMo 开放平台 API Key（mimo.mi.com）',
  },
];

export const providerById = (id) => PROVIDERS.find((p) => p.id === id) || null;

// ---------- 服务商凭证（创始人配置，一家一条，各能力共用） ----------

export function getProviderCredential(providerId) {
  const row = db.prepare('SELECT * FROM ai_providers WHERE provider=?').get(providerId);
  return row ? { provider: row.provider, apiKey: row.api_key, baseUrl: row.base_url } : null;
}

export function allProviderCredentials() {
  return db.prepare('SELECT * FROM ai_providers').all()
    .map((r) => ({ provider: r.provider, apiKey: r.api_key, baseUrl: r.base_url }));
}

export function saveProviderCredential(providerId, apiKey, baseUrl) {
  db.prepare(
    `INSERT INTO ai_providers (provider, api_key, base_url, updated_at) VALUES (?,?,?,?)
     ON CONFLICT(provider) DO UPDATE SET api_key=excluded.api_key, base_url=excluded.base_url, updated_at=excluded.updated_at`
  ).run(providerId, apiKey, baseUrl, new Date().toISOString());
}

/** 删除凭证并级联清掉引用它的能力配置，返回被清空的槽位 */
export function clearProviderCredential(providerId) {
  db.prepare('DELETE FROM ai_providers WHERE provider=?').run(providerId);
  const cleared = [];
  const g = getAiGlobalRaw();
  for (const slot of SLOTS) {
    if (g[slot] && JSON.parse(g[slot]).provider === providerId) {
      clearAiSlot(slot);
      cleared.push(slot);
    }
  }
  return cleared;
}

// ---------- 全局能力配置（创始人专属，单行表） ----------

const SLOTS = ['chat', 'tts', 'asr'];

function parseSlot(json) {
  if (!json) return null;
  try {
    const v = JSON.parse(json);
    return v && v.provider && v.model ? v : null;
  } catch {
    return null;
  }
}

function getAiGlobalRaw() {
  return db.prepare('SELECT chat, tts, asr FROM ai_global WHERE id=1').get() || { chat: null, tts: null, asr: null };
}

/** 槽位配置 + 凭证合并成可直接调用的完整配置；凭证已删则该能力视为未配置 */
function withCredential(slotCfg) {
  if (!slotCfg) return null;
  const cred = getProviderCredential(slotCfg.provider);
  if (!cred) return null;
  return { ...slotCfg, apiKey: cred.apiKey, baseUrl: cred.baseUrl, source: 'global' };
}

/** @returns {{chat:object|null, tts:object|null, asr:object|null}} 合并凭证后的完整配置 */
export function getAiGlobal() {
  const raw = getAiGlobalRaw();
  return {
    chat: withCredential(parseSlot(raw.chat)),
    tts: withCredential(parseSlot(raw.tts)),
    asr: withCredential(parseSlot(raw.asr)),
  };
}

export function saveAiSlot(slot, cfg) {
  if (!SLOTS.includes(slot)) throw new Error('未知配置项');
  db.prepare(`UPDATE ai_global SET ${slot}=?, updated_at=? WHERE id=1`)
    .run(JSON.stringify(cfg), new Date().toISOString());
}

export function clearAiSlot(slot) {
  if (!SLOTS.includes(slot)) throw new Error('未知配置项');
  db.prepare(`UPDATE ai_global SET ${slot}=NULL, updated_at=? WHERE id=1`).run(new Date().toISOString());
}

// 旧结构迁移：ai_global 槽里曾直接存 {provider,apiKey,model,baseUrl}，把凭证搬进 ai_providers
(function migrateLegacySlots() {
  const raw = getAiGlobalRaw();
  for (const slot of SLOTS) {
    const v = raw[slot] ? JSON.parse(raw[slot]) : null;
    if (!v || !v.provider) continue;
    if (v.apiKey && !getProviderCredential(v.provider)) {
      const p = providerById(v.provider);
      saveProviderCredential(v.provider, v.apiKey, v.baseUrl || p?.baseUrl || '');
    }
    if (v.apiKey) {
      const next = { provider: v.provider, model: v.model };
      if (v.voice) next.voice = v.voice;
      saveAiSlot(slot, next);
    }
  }
})();

// ---------- 配置解析：全局配置 > 环境变量兜底（仅对话） ----------

export function envConfig() {
  const baseUrl = (process.env.AI_BASE_URL || '').replace(/\/+$/, '');
  const apiKey = process.env.AI_API_KEY || '';
  const model = process.env.AI_MODEL || 'glm-4-flash';
  return baseUrl && apiKey ? { baseUrl, apiKey, model, source: 'env' } : null;
}

/** 对话模型配置：创始人全局配置 > 环境变量 */
export function resolveConfig() {
  return getAiGlobal().chat || envConfig();
}

/** TTS / ASR 配置（无环境变量兜底） */
export function ttsConfig() {
  return getAiGlobal().tts;
}
export function asrConfig() {
  return getAiGlobal().asr;
}

export function maskKey(k) {
  return !k ? '' : k.length <= 8 ? '***' : `${k.slice(0, 3)}***${k.slice(-4)}`;
}

/** 对外（前端）展示的脱敏配置，明文 Key 永不下发 */
export function publicSlot(cfg) {
  if (!cfg) return { enabled: false };
  const p = cfg.provider ? providerById(cfg.provider) : null;
  return {
    enabled: true,
    provider: cfg.provider || 'env',
    providerName: p?.name || (cfg.source === 'env' ? '服务器环境变量' : cfg.provider || '自定义'),
    model: cfg.model,
    maskedKey: maskKey(cfg.apiKey),
    baseUrl: cfg.baseUrl,
    voice: cfg.voice || null,
    source: cfg.source,
  };
}

// ---------- 远程调用 ----------

/** 远程拉取模型列表（OpenAI 兼容 /models） */
export async function listRemoteModels(cfg) {
  const res = await fetch(`${cfg.baseUrl}/models`, {
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const e = new Error(res.status === 401 ? 'API Key 无效' : `模型列表拉取失败（${res.status}）`);
    e.status = res.status;
    throw e;
  }
  const data = await res.json();
  return (Array.isArray(data.data) ? data.data : []).map((m) => m.id).filter(Boolean);
}

/**
 * @param {{baseUrl:string, apiKey:string, model:string}} cfg
 * @param {Array<{role:'system'|'user'|'assistant', content:string}>} messages
 * @param {{temperature?:number, max_tokens?:number, timeoutMs?:number}} opts
 */
export async function aiChat(cfg, messages, opts = {}) {
  let res;
  try {
    res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        temperature: opts.temperature ?? 0.7,
        max_tokens: opts.max_tokens ?? 500,
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 25000),
    });
  } catch (e) {
    if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
      throw new Error('教练想太久了（超时），稍后再试');
    }
    throw e;
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`AI upstream ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== 'string') throw new Error('AI 返回格式不对');
  return text.trim();
}

/** TTS：OpenAI 兼容 /audio/speech，返回 {buffer, contentType} */
export async function aiTts(cfg, text) {
  const res = await fetch(`${cfg.baseUrl}/audio/speech`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: cfg.model,
      input: text.slice(0, 600),
      voice: cfg.voice || undefined,
      response_format: 'mp3',
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`TTS upstream ${res.status}: ${body.slice(0, 200)}`);
  }
  return { buffer: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get('content-type') || 'audio/mpeg' };
}

/** ASR：OpenAI 兼容 /audio/transcriptions，原始录音转发为 multipart */
export async function aiAsr(cfg, audio, mime) {
  const ext = (mime || '').includes('mp4') ? 'm4a'
    : (mime || '').includes('wav') ? 'wav'
    : (mime || '').includes('mpeg') ? 'mp3'
    : (mime || '').includes('ogg') ? 'ogg'
    : 'webm';
  const fd = new FormData();
  fd.append('file', new Blob([audio], { type: mime || 'audio/webm' }), `audio.${ext}`);
  fd.append('model', cfg.model);
  const res = await fetch(`${cfg.baseUrl}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
    body: fd,
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`ASR upstream ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json().catch(() => null);
  const text = typeof data?.text === 'string' ? data.text.trim() : '';
  if (!text) throw new Error('没识别到内容，再试一次');
  return text;
}

/** 兼容旧调用：仅环境变量层面是否配置 */
export const aiEnabled = () => !!resolveConfig();
export const aiModel = () => resolveConfig()?.model ?? null;

/** 从模型回复里抠出 JSON 数组（容忍 markdown 代码块和前后废话） */
export function extractJsonArray(raw) {
  const s = raw.replace(/```(?:json)?/gi, '');
  const start = s.indexOf('[');
  const end = s.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const v = JSON.parse(s.slice(start, end + 1));
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

/** 从模型回复里抠出 JSON 对象（同上，容忍包裹） */
export function extractJsonObject(raw) {
  const s = raw.replace(/```(?:json)?/gi, '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const v = JSON.parse(s.slice(start, end + 1));
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

// ---------- 教练日报缓存（写操作后失效） ----------
/** @type {Map<number, {t:number, text:string}>} */
export const coachCache = new Map();
export function invalidateCoach(uid) {
  coachCache.delete(uid);
}

// ---------- 每日配额（内存版，重启即清零） ----------
/** @type {Map<string, {d:string, n:number}>} */
const quotas = new Map();
export function takeQuota(key, limit) {
  const today = new Date().toISOString().slice(0, 10);
  const q = quotas.get(key);
  if (!q || q.d !== today) {
    quotas.set(key, { d: today, n: 1 });
    return true;
  }
  if (q.n >= limit) return false;
  q.n++;
  return true;
}

// ---------- 人设与提示词 ----------

export const PERSONA = `你是减肥应用「破釜」里的教练，人设：退役体能教官。毒舌但专业，真心为用户好。
规则：
- 只依据提供的数据说话，绝不编造数值
- 简短直接，给判断和指令，不说客套话，不喊口号
- 用户有未缴罚金时，第一句话必须是催缴
- 语气可以狠，但不进行人身攻击、不嘲讽外貌
- 用中文，用「你」称呼用户`;

export const COACH_SYSTEM = `${PERSONA}
你现在要发今日简报：120 字以内，一段话。`;

export const CHAT_SYSTEM = `${PERSONA}
你现在和用户对话：每次回复 300 字以内。可以给具体建议（饮食安排、运动量、心态），涉及热量估算时给出大致数字并注明是估算。`;

export function parseSystem() {
  return `你是饮食记录解析器。从用户的描述中提取食物清单并估算热量。
返回 JSON 数组，每项格式：{"name":"食物名","meal":"breakfast|lunch|dinner|snack","qty":数量,"unit":"份|个|碗|杯|ml|g","calories":该条目总千卡}
要求：
- name 用简短中文
- meal 按描述中的时间推断，无法推断用 snack
- calories 基于常见中国食物估算
- 忽略无法识别的内容；没有食物就返回 []
- 只返回 JSON 数组，不要任何其他文字`;
}

export function exerciseParseSystem(activityList) {
  return `你是运动记录解析器。从用户的描述中提取运动清单。
返回 JSON 数组，每项格式：{"activity":"活动名","minutes":分钟数}
要求：
- activity 必须严格从下面的列表中选择，原样使用列表中的名字：${activityList.join('、')}
- minutes 为正整数，按描述估算
- 忽略无法识别的内容；没有运动就返回 []
- 只返回 JSON 数组，不要任何其他文字`;
}

/** 教练指令路由：一句话判断是记体重/记饮食/记运动还是闲聊 */
export function commandSystem(today, activityList) {
  return `你是减肥应用「破釜」的指令路由器。今天是 ${today}。判断用户这句话想干什么，只返回一个 JSON 对象，不要任何其他文字。

可能的返回：
1. 记体重：{"type":"weigh","weight_kg":65.2,"date":"${today}"}
2. 记饮食：{"type":"diet","date":"YYYY-MM-DD","items":[{"name":"五香牛肉面","meal":"lunch","qty":1,"unit":"碗","calories":550}]}
3. 记运动：{"type":"exercise","date":"YYYY-MM-DD","items":[{"activity":"慢跑(8km/h)","minutes":30}]}
4. 其他（提问、闲聊、咨询、模糊指令）：{"type":"chat"}

规则：
- 只有用户明确要「记录/记一下/帮我记」体重、饮食或运动时才返回 1/2/3；拿不准就 chat
- date 按描述换算成具体日期：没提日期用 ${today}；「昨天」往前推一天；绝不使用未来日期
- weigh：weight_kg 为数字（千克），用户说「斤」要除以 2 换算成千克
- diet：name 简短中文；meal 从 breakfast/lunch/dinner/snack 里按描述时间推断，推断不出用 snack；calories 按常见中国食物估算该条目总千卡
- exercise：activity 必须严格从下面的列表中原样选择：${activityList.join('、')}；minutes 为正整数
- 多个意图混在一句里，选最主要的那个`;
}
