// AI 能力探测（无鉴权 /ai-status）：模块级缓存，整页只查一次
let capsPromise: Promise<{ enabled: boolean; model: string | null; tts: boolean; asr: boolean }> | null = null;

export function aiCaps() {
  if (!capsPromise) {
    capsPromise = fetch('/api/ai-status')
      .then((r) => (r.ok ? r.json() : { enabled: false, model: null, tts: false, asr: false }))
      .catch(() => ({ enabled: false, model: null as any, tts: false, asr: false }));
  }
  return capsPromise;
}
