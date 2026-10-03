import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router';
import { api } from '@/lib/api';
import { toast, useAuth } from '@/lib/store';
import { Btn, Card, Field, Input } from '@/components/ui-kit';
import type { AiSettings, AiSlot, SlotStatus } from '@/lib/types';

// 创始人专属 · AI 模型配置（独立页面，两层结构）：
// ① 服务商：每家官方 API 存一份 Key，配一次全能力共用
// ② 能力分配：对话 / TTS / ASR 各选一家已配置的服务商，从它的模型列表里挑

interface ProviderRow {
  id: string;
  name: string;
  baseUrl: string;
  keyHint: string;
  keyUrl?: string;
  ttsVoice?: string;
  configured: boolean;
  maskedKey: string | null;
  baseUrlUsed: string | null;
}

const SLOT_META: Record<AiSlot, { label: string; desc: string }> = {
  chat: { label: '对话模型', desc: '教练对话 / 一句话记账 / 日报' },
  tts: { label: '语音合成', desc: '教练简报朗读（今日页 🔊）' },
  asr: { label: '语音识别', desc: '说话吩咐教练 / 语音记账' },
};

// 远程 /models 不返回模型类型（只有 id/owned_by），按厂商通用的命名规律做分类过滤：
// TTS：tts/speech/cosyvoice…；ASR：asr/paraformer/sensevoice…；对话：排除语音/图像/向量/翻译等非对话模型
const TTS_RE = /tts|speech|cosyvoice|voice-?clone/i;
const ASR_RE = /asr|paraformer|sensevoice|whisper|transcri/i;
const NON_CHAT_RE = /embedding|rerank|tts|speech|cosyvoice|asr|paraformer|sensevoice|whisper|transcri|image|video|ocr|mt-|-mt$|^wan\d/i;

/** 模型名是否属于该能力槽位 */
function matchSlot(id: string, slot: AiSlot): boolean {
  if (slot === 'tts') return TTS_RE.test(id);
  if (slot === 'asr') return ASR_RE.test(id);
  // omni / realtime 多模态模型能对话，保留
  if (NON_CHAT_RE.test(id) && !/omni|realtime/i.test(id)) return false;
  return true;
}

export default function AiConfigPage() {
  const { user } = useAuth();
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [slots, setSlots] = useState<AiSettings | null>(null);
  const [openProvider, setOpenProvider] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [busy, setBusy] = useState(false);

  // 能力分配草稿
  const [openSlot, setOpenSlot] = useState<AiSlot | null>(null);
  const [slotProvider, setSlotProvider] = useState('');
  const [slotModel, setSlotModel] = useState('');
  const [slotVoice, setSlotVoice] = useState('');
  const [slotModels, setSlotModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelFilter, setModelFilter] = useState('');

  if (user && user.role !== 'founder') return <Navigate to="/me" replace />;

  const reload = () => {
    api<{ providers: ProviderRow[] }>('/ai/providers').then((r) => setProviders(r.providers)).catch(() => {});
    api<AiSettings>('/ai/settings').then(setSlots).catch(() => {});
  };
  useEffect(reload, []);

  const configured = providers.filter((p) => p.configured);
  const cur = openSlot ? providers.find((p) => p.id === slotProvider) : null;

  // 远程模型按当前能力槽分类过滤（厂商 /models 不带类型，靠命名规律识别）；多了给搜索框
  const visibleModels = useMemo(() => {
    const list = openSlot ? slotModels.filter((m) => matchSlot(m, openSlot)) : [];
    const q = modelFilter.trim().toLowerCase();
    return q ? list.filter((m) => m.toLowerCase().includes(q)) : list;
  }, [openSlot, slotModels, modelFilter]);

  // ---------- 服务商层 ----------

  function toggleProvider(p: ProviderRow) {
    if (openProvider === p.id) {
      setOpenProvider(null);
      return;
    }
    setOpenProvider(p.id);
    setKeyInput('');
    setUrlInput(p.baseUrlUsed || p.baseUrl);
  }

  async function saveProvider(p: ProviderRow) {
    if (!keyInput.trim()) return toast('填 API Key', 'error');
    setBusy(true);
    try {
      const body: Record<string, string> = { apiKey: keyInput.trim() };
      if (urlInput.trim()) body.baseUrl = urlInput.trim();
      await api(`/ai/providers/${p.id}`, { method: 'PUT', body });
      toast(`${p.name} 已配置`, 'good');
      setKeyInput('');
      reload();
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function removeProvider(p: ProviderRow) {
    setBusy(true);
    try {
      const r = await api<{ clearedSlots: string[] }>(`/ai/providers/${p.id}`, { method: 'DELETE' });
      toast(r.clearedSlots.length ? `${p.name} 已删除，${r.clearedSlots.length} 个能力被清空` : `${p.name} 已删除`, 'info');
      setOpenProvider(null);
      reload();
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  // ---------- 能力层 ----------

  function toggleSlot(slot: AiSlot, st?: SlotStatus) {
    if (openSlot === slot) {
      setOpenSlot(null);
      return;
    }
    setOpenSlot(slot);
    setSlotProvider(st?.provider && st.provider !== 'env' ? st.provider : '');
    setSlotModel(st?.model || '');
    setSlotVoice(st?.voice || '');
    setSlotModels([]);
    setModelFilter('');
  }

  async function pickSlotProvider(id: string) {
    setSlotProvider(id);
    setSlotModel('');
    setSlotModels([]);
    setModelFilter('');
    setLoadingModels(true);
    try {
      const r = await api<{ models: string[] }>(`/ai/providers/${id}/models`);
      setSlotModels(r.models);
    } catch (e: any) {
      toast(`${e.message}（可手填模型名）`, 'error');
    } finally {
      setLoadingModels(false);
    }
  }

  async function saveSlot(slot: AiSlot) {
    if (!slotProvider) return toast('先选服务商', 'error');
    if (!slotModel.trim()) return toast('选一个模型', 'error');
    setBusy(true);
    try {
      const body: Record<string, string> = { slot, provider: slotProvider, model: slotModel.trim() };
      if (slot === 'tts' && slotVoice.trim()) body.voice = slotVoice.trim();
      await api('/ai/settings', { method: 'PUT', body });
      toast(`${SLOT_META[slot].label}已保存`, 'good');
      setOpenSlot(null);
      reload();
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function clearSlot(slot: AiSlot) {
    setBusy(true);
    try {
      await api(`/ai/settings/${slot}`, { method: 'DELETE' });
      toast(`${SLOT_META[slot].label}已清除`, 'info');
      setOpenSlot(null);
      reload();
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3.5">
      {/* 页头 */}
      <div className="flex items-center gap-2.5 pt-1">
        <Link to="/me" className="flex size-9 items-center justify-center rounded-full border-2 border-ink bg-paper-2 press wob-sm" aria-label="返回">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </Link>
        <div>
          <div className="text-lg font-bold leading-tight">AI 模型配置</div>
          <div className="text-[11px] text-ink-soft">创始人专属 · 全营共用</div>
        </div>
      </div>

      {/* ① 服务商 */}
      <div className="pt-1 text-[13px] font-bold text-ink-soft">① 服务商 · 填 API Key</div>
      <div className="-mt-2 text-[11px] text-ink-soft/80">想用哪家就在哪家填一次 Key，三个能力共用</div>
      <Card className="p-0">
        {providers.map((p, i) => (
          <div key={p.id} className={i < providers.length - 1 ? 'border-b-2 border-dashed border-ink/20' : ''}>
            <button
              type="button"
              className="flex w-full items-center gap-2.5 px-4 py-3.5 text-left active:bg-cream"
              onClick={() => toggleProvider(p)}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-bold">{p.name}</span>
                <span className="mt-0.5 block truncate text-[11px] text-ink-soft">
                  {p.configured ? `${p.maskedKey} · ${p.baseUrlUsed || p.baseUrl}` : '未配置'}
                </span>
              </span>
              {p.configured ? (
                <span className="shrink-0 rounded-full bg-good/20 px-2 py-0.5 text-[10px] font-bold text-good-deep">已配置 ✓</span>
              ) : (
                <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold text-ink-soft">未配置</span>
              )}
            </button>

            {openProvider === p.id && (
              <div className="space-y-3 border-t-2 border-dashed border-ink/20 bg-paper-2/60 px-4 py-3.5">
                <Field label="API Key" hint={p.keyUrl}>
                  <Input
                    type="password"
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value.trim())}
                    autoCapitalize="off"
                    placeholder={p.configured ? `已保存 ${p.maskedKey}，输入新的覆盖` : p.keyHint.split('（')[0]}
                  />
                </Field>
                <Field label="接入地址 Base URL" hint={urlInput === p.baseUrl ? '官方默认' : '已自定义'}>
                  <Input value={urlInput} onChange={(e) => setUrlInput(e.target.value.trim())} autoCapitalize="off" inputMode="url" />
                </Field>
                <div className="flex gap-2">
                  <Btn block disabled={busy || !keyInput.trim()} onClick={() => saveProvider(p)}>
                    {busy ? '校验中…' : '校验并保存'}
                  </Btn>
                  {p.configured && (
                    <Btn variant="outline" disabled={busy} onClick={() => removeProvider(p)}>
                      删除
                    </Btn>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </Card>

      {/* ② 能力分配 */}
      <div className="pt-1.5 text-[13px] font-bold text-ink-soft">② 能力 · 选厂商和模型</div>
      <div className="-mt-2 text-[11px] text-ink-soft/80">每个能力可以来自不同厂商，从它提供的模型里挑</div>
      <Card className="p-0">
        {(['chat', 'tts', 'asr'] as AiSlot[]).map((slot, i) => {
          const st = slots?.[slot];
          const open = openSlot === slot;
          return (
            <div key={slot} className={i < 2 ? 'border-b-2 border-dashed border-ink/20' : ''}>
              <button
                type="button"
                className="flex w-full items-center gap-2.5 px-4 py-3.5 text-left active:bg-cream"
                onClick={() => toggleSlot(slot, st || undefined)}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-bold">{SLOT_META[slot].label}</span>
                  <span className="mt-0.5 block truncate text-[11px] text-ink-soft">
                    {st?.enabled ? `${st.providerName} · ${st.model}${st.voice ? ` · ${st.voice}` : ''}` : SLOT_META[slot].desc}
                  </span>
                </span>
                {st?.enabled ? (
                  <span className="shrink-0 rounded-full bg-good/20 px-2 py-0.5 text-[10px] font-bold text-good-deep">已启用</span>
                ) : (
                  <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold text-ink-soft">未配置</span>
                )}
              </button>

              {open && (
                <div className="space-y-3 border-t-2 border-dashed border-ink/20 bg-paper-2/60 px-4 py-3.5">
                  {configured.length === 0 ? (
                    <div className="text-[12px] leading-relaxed text-ink-soft">先在上面给至少一家服务商填好 API Key，才能选模型。</div>
                  ) : (
                    <>
                      <div>
                        <div className="mb-1.5 text-[13px] font-medium">服务商（已配置 {configured.length} 家）</div>
                        <div className="flex flex-wrap gap-2">
                          {configured.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => pickSlotProvider(p.id)}
                              className={`h-10 border-2 px-3.5 text-[13px] font-bold press ${
                                slotProvider === p.id ? 'wob-sm border-ink bg-brand/15 text-brand-deep ink-shadow-xs' : 'wob-sm border-ink/30 bg-paper text-ink-soft'
                              }`}
                            >
                              {p.name}
                            </button>
                          ))}
                        </div>
                      </div>

                      {slotProvider && (
                        <>
                          <div>
                            <div className="mb-1.5 flex items-center justify-between">
                              <span className="text-[13px] font-medium">模型</span>
                              <button type="button" className="text-[12px] font-bold text-brand" disabled={loadingModels} onClick={() => pickSlotProvider(slotProvider)}>
                                {loadingModels ? '拉取中…' : '重新拉取'}
                              </button>
                            </div>

                            {/* 远程模型按能力分类过滤后的统一列表；条目多时给搜索框 */}
                            {loadingModels ? (
                              <div className="flex h-11 items-center justify-center border-2 border-dashed border-ink/25 text-[12px] text-ink-soft">正在拉取模型列表…</div>
                            ) : visibleModels.length > 0 ? (
                              <>
                                {visibleModels.length > 12 && (
                                  <Input
                                    value={modelFilter}
                                    onChange={(e) => setModelFilter(e.target.value)}
                                    placeholder="搜索模型…"
                                    className="mb-2 h-10 text-[13px]"
                                  />
                                )}
                                <div className="no-bar max-h-56 space-y-1.5 overflow-y-auto">
                                  {visibleModels.map((m) => (
                                    <button
                                      key={m}
                                      type="button"
                                      onClick={() => setSlotModel(m)}
                                      className={`flex w-full items-center justify-between gap-2 border-2 px-3 py-2.5 text-left press ${
                                        slotModel === m ? 'wob-sm border-ink bg-brand/10' : 'wob-sm border-ink/30 bg-paper'
                                      }`}
                                    >
                                      <span className={`min-w-0 truncate text-[13px] font-bold ${slotModel === m ? 'text-brand-deep' : ''}`}>{m}</span>
                                      <span className={`size-3.5 shrink-0 rounded-full border-2 ${slotModel === m ? 'border-ink bg-brand' : 'border-ink/40'}`} />
                                    </button>
                                  ))}
                                </div>
                              </>
                            ) : slotModels.length > 0 ? (
                              // 拉到了列表但没有匹配项：搜索词没搜到，或该厂商没有这个能力的模型
                              <>
                                <div className="mb-2 text-[12px] leading-relaxed text-ink-soft">
                                  {modelFilter
                                    ? `没有匹配「${modelFilter.trim()}」的模型，换个关键词，或确定有的话手填：`
                                    : `该厂商的模型列表里没有识别到${SLOT_META[openSlot!].label}类模型，确定有的话手填：`}
                                </div>
                                <Input
                                  value={slotModel}
                                  onChange={(e) => setSlotModel(e.target.value)}
                                  autoCapitalize="off"
                                  placeholder="手填模型名"
                                />
                              </>
                            ) : (
                              <Input
                                value={slotModel}
                                onChange={(e) => setSlotModel(e.target.value)}
                                autoCapitalize="off"
                                placeholder="该厂商未开放列表，手填模型名"
                              />
                            )}
                          </div>

                          {slot === 'tts' && (
                            <Field label="音色（选填）" hint={cur?.ttsVoice ? `如 ${cur.ttsVoice}` : '部分厂商需要'}>
                              <Input value={slotVoice} onChange={(e) => setSlotVoice(e.target.value)} autoCapitalize="off" />
                            </Field>
                          )}

                          <div className="flex gap-2">
                            <Btn block disabled={busy} onClick={() => saveSlot(slot)}>
                              {busy ? '校验中…' : `保存${SLOT_META[slot].label}`}
                            </Btn>
                            {st?.enabled && (
                              <Btn variant="outline" disabled={busy} onClick={() => clearSlot(slot)}>
                                清除
                              </Btn>
                            )}
                          </div>
                        </>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </Card>

      <div className="pb-2 text-[11px] leading-relaxed text-ink-soft/70">
        Key 只存在服务器数据库，经后端代理调用厂商 API，不下发给浏览器。保存服务商时先远程校验 Key；对话模型保存时会校验它在厂商列表里。
      </div>
    </div>
  );
}
