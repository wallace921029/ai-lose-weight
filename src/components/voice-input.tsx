import { useEffect, useRef, useState } from 'react';
import { getToken } from '@/lib/api';
import { toast } from '@/lib/store';
import { aiCaps } from '@/lib/ai-caps';

/**
 * 语音输入：创始人配置了 ASR 模型时走服务器识别（MediaRecorder 录音 → /api/ai/asr），
 * 否则回落浏览器 Web Speech API（Chrome / Safari / iOS 14.5+，需 HTTPS 或 localhost）。
 * onText 可能被多次回调（每段识别结束），由调用方决定拼接方式。
 */

function pickMime() {
  const list = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac'];
  for (const m of list) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m;
  }
  return '';
}

export function VoiceInput({ onText, label = '语音输入' }: { onText: (text: string) => void; label?: string }) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [uploading, setUploading] = useState(false);
  const [serverAsr, setServerAsr] = useState<boolean | null>(null);
  const recRef = useRef<any>(null); // Web Speech
  const mediaRef = useRef<{ rec: MediaRecorder; stream: MediaStream } | null>(null); // 服务器 ASR

  const SR = typeof window !== 'undefined' && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  const browserSupported = !!SR && (typeof window !== 'undefined' ? window.isSecureContext !== false : true);

  useEffect(() => {
    aiCaps().then((c) => setServerAsr(!!c.asr));
  }, []);

  // ---------- 服务器 ASR：录音 → 上传 ----------

  async function stopRecording() {
    mediaRef.current?.rec.stop();
  }

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia) {
      return toast('这个浏览器不支持录音，请用键盘输入', 'error');
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return toast('麦克风权限被拒绝，请在浏览器设置里允许', 'error');
    }
    const mime = pickMime();
    let rec: MediaRecorder;
    try {
      rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      return toast('录音启动失败，请用键盘输入', 'error');
    }
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      mediaRef.current = null;
      setListening(false);
      const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
      if (blob.size < 800) {
        toast('没录到什么，长一点再按', 'error');
        return;
      }
      setUploading(true);
      try {
        const res = await fetch('/api/ai/asr', {
          method: 'POST',
          headers: { 'Content-Type': blob.type, ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
          body: blob,
        });
        const d = await res.json().catch(() => null);
        if (!res.ok) throw new Error(d?.error || '识别失败，再试一次');
        if (d.text) onText(d.text);
      } catch (e: any) {
        toast(e.message, 'error');
      } finally {
        setUploading(false);
      }
    };
    rec.start();
    mediaRef.current = { rec, stream };
    setListening(true);
  }

  // ---------- 浏览器 Web Speech（回落） ----------

  function stop() {
    recRef.current?.stop();
  }

  function start() {
    if (!SR) return toast('这个浏览器不支持语音，请用键盘输入', 'error');
    if (window.isSecureContext === false) return toast('语音需要 HTTPS 环境', 'error');
    try {
      const rec = new SR();
      rec.lang = 'zh-CN';
      rec.continuous = true;
      rec.interimResults = true;
      rec.onresult = (e: any) => {
        let finalText = '';
        let interimText = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) finalText += r[0].transcript;
          else interimText += r[0].transcript;
        }
        if (finalText) onText(finalText.trim());
        setInterim(interimText);
      };
      rec.onerror = (e: any) => {
        setListening(false);
        setInterim('');
        if (e.error === 'not-allowed') toast('麦克风权限被拒绝，请在浏览器设置里允许', 'error');
        else if (e.error !== 'no-speech' && e.error !== 'aborted') toast('没听清，再试一次', 'error');
      };
      rec.onend = () => {
        setListening(false);
        setInterim('');
      };
      rec.start();
      recRef.current = rec;
      setListening(true);
    } catch {
      toast('语音启动失败，请用键盘输入', 'error');
    }
  }

  const useServer = serverAsr === true;
  const busy = listening || uploading;
  const hint = uploading
    ? '识别中…'
    : listening
      ? useServer
        ? '正在录…说完点结束'
        : interim || '（说吧，识别完自动填入）'
      : '';

  return (
    <div>
      <button
        type="button"
        onClick={busy ? (useServer ? stopRecording : stop) : useServer ? startRecording : start}
        disabled={serverAsr === null}
        className={`flex h-11 w-full items-center justify-center gap-2 border-2 border-ink text-[14px] font-bold press ${
          busy ? 'wob bg-brand/15 text-brand-deep' : 'wob bg-paper-2 text-ink'
        }`}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9" className={listening ? 'animate-pulse' : ''}>
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3" strokeLinecap="round" />
        </svg>
        {uploading ? 'AI 识别中…' : listening ? (useServer ? '正在录音…点击结束' : '正在听…点击结束') : `🎙 ${label}${useServer ? '（AI）' : ''}`}
      </button>
      {hint && <div className="mt-2 min-h-5 text-center text-[13px] text-brand">{hint}</div>}
      {!useServer && !browserSupported && serverAsr !== null && (
        <div className="mt-1.5 text-center text-[11px] text-muted-foreground">
          当前浏览器不支持语音（需 Chrome/Safari 且 HTTPS），可用键盘输入
        </div>
      )}
      {serverAsr === null && <div className="mt-1.5 text-center text-[11px] text-muted-foreground">正在确认语音识别方式…</div>}
    </div>
  );
}
