import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Sheet } from './ui-kit';
import type { AiSettings, SlotStatus } from '@/lib/types';

// 普通用户视角：AI 能力状态（只读）——所有模型由创始人统一配置

const SLOTS: { key: keyof Pick<AiSettings, 'chat' | 'tts' | 'asr'>; icon: string; label: string; off: string }[] = [
  { key: 'chat', icon: '💬', label: 'AI 教练对话', off: '只有规则台词' },
  { key: 'tts', icon: '🔊', label: '教练语音播报', off: '只能看字' },
  { key: 'asr', icon: '🎙', label: '语音识别输入', off: '用键盘输入' },
];

function SlotRow({ icon, label, st, off }: { icon: string; label: string; st?: SlotStatus; off: string }) {
  return (
    <div className="flex items-center gap-3 border-b-2 border-dashed border-ink/20 py-3 last:border-0">
      <span className="w-7 shrink-0 text-center text-lg" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-bold">{label}</div>
        <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {st?.enabled ? `${st.providerName} · ${st.model}` : off}
        </div>
      </div>
      {st?.enabled ? (
        <span className="shrink-0 rounded-full bg-good/20 px-2 py-0.5 text-[10px] font-bold text-good-deep">已启用</span>
      ) : (
        <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold text-ink-soft">未配置</span>
      )}
    </div>
  );
}

export function AiSettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [status, setStatus] = useState<AiSettings | null>(null);

  useEffect(() => {
    if (!open) return;
    api<AiSettings>('/ai/settings').then(setStatus).catch(() => {});
  }, [open]);

  return (
    <Sheet open={open} onClose={onClose} title="AI 教练">
      <div className="mb-3">
        {SLOTS.map((s) => (
          <SlotRow key={s.key} icon={s.icon} label={s.label} st={status?.[s.key]} off={s.off} />
        ))}
      </div>
      <div className="rounded-xl bg-secondary/60 p-3 text-[12px] leading-relaxed">
        所有 AI 模型（对话 / 语音合成 / 语音识别）由创始人统一配置，全营共用。
        {status && SLOTS.every((s) => !status[s.key].enabled) && ' 目前还没配置，教练只会说标准台词。'}
      </div>
    </Sheet>
  );
}
