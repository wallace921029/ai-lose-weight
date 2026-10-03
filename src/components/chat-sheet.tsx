import { useEffect, useRef, useState } from 'react';
import { api, refreshToday } from '@/lib/api';
import { toast, useAuth } from '@/lib/store';
import { Btn, Sheet } from './ui-kit';
import { VoiceInput } from './voice-input';

// AI 教练对话：可以直接吩咐记录（「记体重 65 千克」「中午吃了一碗牛肉面」），
// 教练自动判断意图 → 卡片式确认 → 确认后入库；闲聊则正常对话

interface DietItem { name: string; meal: string; qty: number; unit: string; calories: number; }
interface ExerciseItem { activity: string; minutes: number; calories: number; }
interface CoachAction {
  type: 'weigh' | 'diet' | 'exercise';
  date?: string;
  weight_kg?: number;
  items?: DietItem[] | ExerciseItem[];
}
type ActionState = 'pending' | 'done' | 'canceled';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
  action?: CoachAction;
  actionState?: ActionState;
}

const QUICK = [
  '记体重 65.2kg',
  '中午吃了一碗牛肉面',
  '傍晚跑了半小时',
  '这周还有救吗？',
];

const MEAL_CN: Record<string, string> = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '加餐' };
const storeKey = (uid: number) => `pofu_chat_${uid}`;
// 本地时区的今天（与后端一致；toISOString 会差 8 小时）
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** 待确认 / 已入库 / 已取消的记录卡片 */
function ActionCard({ action, state, onConfirm, onCancel, busy }: {
  action: CoachAction;
  state: ActionState;
  onConfirm: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const meta =
    action.type === 'weigh' ? { icon: '⚖️', title: '记录体重' }
    : action.type === 'diet' ? { icon: '🍜', title: '记录饮食' }
    : { icon: '🏃', title: '记录运动' };
  const dateLabel = action.date && action.date !== todayStr() ? `（${action.date}）` : '';

  return (
    <div className={`wob-r mt-1.5 border-2 border-ink bg-paper ink-shadow-xs ${state === 'canceled' ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-2 border-b-2 border-dashed border-ink/25 px-3 py-2">
        <span className="text-base" aria-hidden>{meta.icon}</span>
        <span className="text-[12px] font-bold text-ink-soft">
          {meta.title}
          {dateLabel}
        </span>
        {state === 'done' && <span className="ml-auto rounded-full bg-good/20 px-2 py-0.5 text-[10px] font-bold text-good-deep">已入库 ✓</span>}
        {state === 'canceled' && <span className="ml-auto rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold text-ink-soft">已取消</span>}
      </div>
      <div className="space-y-1.5 px-3 py-2.5">
        {action.type === 'weigh' && (
          <div className="text-[15px] font-bold">
            <span className="tnum">{action.weight_kg?.toFixed(1)}</span> kg
          </div>
        )}
        {action.type === 'diet' &&
          (action.items as DietItem[]).map((it, i) => (
            <div key={i} className="flex items-baseline justify-between gap-2 text-[13px]">
              <span className="min-w-0 truncate">
                {MEAL_CN[it.meal] && <span className="mr-1 text-[11px] text-ink-soft">{MEAL_CN[it.meal]}</span>}
                <b>{it.name}</b>
                <span className="ml-1 text-ink-soft">×{it.qty}{it.unit}</span>
              </span>
              <span className="tnum shrink-0 font-bold">{it.calories} kcal</span>
            </div>
          ))}
        {action.type === 'exercise' &&
          (action.items as ExerciseItem[]).map((it, i) => (
            <div key={i} className="flex items-baseline justify-between gap-2 text-[13px]">
              <span className="min-w-0 truncate">
                <b>{it.activity}</b>
                <span className="ml-1 text-ink-soft">{it.minutes} 分钟</span>
              </span>
              <span className="tnum shrink-0 font-bold">−{it.calories} kcal</span>
            </div>
          ))}
      </div>
      {state === 'pending' && (
        <div className="flex gap-2 border-t-2 border-dashed border-ink/25 px-3 py-2.5">
          <Btn size="sm" className="flex-1" disabled={busy} onClick={onConfirm}>
            {busy ? '入库中…' : '确认入库'}
          </Btn>
          <Btn size="sm" variant="outline" disabled={busy} onClick={onCancel}>
            取消
          </Btn>
        </div>
      )}
    </div>
  );
}

export function ChatSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false); // 卡片入库中
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !user) return;
    try {
      setMsgs(JSON.parse(localStorage.getItem(storeKey(user.id)) || '[]'));
    } catch {
      setMsgs([]);
    }
  }, [open, user]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [msgs, busy]);

  const persist = (m: Msg[]) => {
    setMsgs(m);
    if (user) localStorage.setItem(storeKey(user.id), JSON.stringify(m.slice(-40)));
  };

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || busy) return;
    setInput('');
    const next = [...msgs, { role: 'user' as const, content }];
    setMsgs(next);
    setBusy(true);
    try {
      const r = await api<{ kind: 'chat' | 'action'; reply?: string; action?: CoachAction }>('/coach/command', { text: content });
      if (r.kind === 'action' && r.action) {
        persist([...next, { role: 'assistant', content: '收到，确认一下就入库：', action: r.action, actionState: 'pending' }]);
      } else {
        persist([...next, { role: 'assistant', content: r.reply || '……' }]);
      }
    } catch (e: any) {
      // 失败不吞输入：原文放回输入框，改两句就能重发
      toast(e.message || '发送失败', 'error');
      setMsgs(msgs);
      setInput(content);
    } finally {
      setBusy(false);
    }
  }

  /** 卡片确认：按类型走既有入库接口，全部成功才标记 done */
  async function applyAction(index: number) {
    const m = msgs[index];
    if (!m?.action || m.actionState !== 'pending' || applying) return;
    setApplying(true);
    const action = m.action;
    try {
      if (action.type === 'weigh') {
        await api('/weigh', { weight_kg: action.weight_kg });
      } else if (action.type === 'diet') {
        for (const it of action.items as DietItem[]) {
          await api('/diet', { date: action.date, ...it });
        }
      } else {
        for (const it of action.items as ExerciseItem[]) {
          await api('/exercise', { date: action.date, activity: it.activity, minutes: it.minutes });
        }
      }
      persist(msgs.map((x, i) => (i === index ? { ...x, actionState: 'done' as const } : x)));
      refreshToday();
      toast(action.type === 'weigh' ? '体重已记录' : action.type === 'diet' ? '饮食已入账' : '运动已入账', 'good');
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setApplying(false);
    }
  }

  function cancelAction(index: number) {
    persist(msgs.map((x, i) => (i === index ? { ...x, actionState: 'canceled' as const } : x)));
  }

  return (
    <Sheet open={open} onClose={onClose} title="AI 教练">
      <div className="flex h-[62vh] flex-col">
        <div ref={listRef} className="flex-1 space-y-2.5 overflow-y-auto py-1">
          {msgs.length === 0 && (
            <div className="space-y-2 pt-4 text-center text-[12px] leading-relaxed text-muted-foreground">
              <div>直接吩咐教练记录：</div>
              <div className="font-bold text-ink-soft">「帮我记录下体重，65千克」</div>
              <div className="font-bold text-ink-soft">「中午吃了一碗五香牛肉面」</div>
              <div className="font-bold text-ink-soft">「傍晚跑了半小时」</div>
              <div>确认卡片后自动入账，问减重问题也行</div>
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div className={`flex max-w-[92%] ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {m.role === 'assistant' && (
                  <span className="mr-2 mt-1 shrink-0 text-base" aria-hidden>
                    🎖️
                  </span>
                )}
                <div
                  className={`border-2 border-ink px-3.5 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'wob bg-brand text-white ink-shadow-xs'
                      : m.action
                        ? 'wob-r bg-paper text-ink'
                        : 'wob-r bg-paper-2 text-ink ink-shadow-xs'
                  } ${m.content ? '' : '!border-0 !bg-transparent !p-0 !shadow-none'}`}
                >
                  {m.content}
                </div>
              </div>
              {m.action && (
                <div className="max-w-[92%] pl-7">
                  <ActionCard
                    action={m.action}
                    state={m.actionState || 'pending'}
                    busy={applying}
                    onConfirm={() => applyAction(i)}
                    onCancel={() => cancelAction(i)}
                  />
                </div>
              )}
            </div>
          ))}
          {busy && (
            <div className="flex justify-start">
              <span className="mr-2 mt-1 text-base" aria-hidden>
                🎖️
              </span>
              <div className="wob-r border-2 border-ink bg-paper-2 px-4 py-3 text-[14px] text-ink-soft ink-shadow-xs">正在想…</div>
            </div>
          )}
        </div>

        {msgs.length === 0 && !busy && (
          <div className="no-bar flex gap-2 overflow-x-auto py-2.5">
            {QUICK.map((q) => (
              <button
                key={q}
                className="shrink-0 rounded-full border-2 border-ink bg-paper-2 px-3 py-1.5 text-[12px] whitespace-nowrap press"
                onClick={() => send(q)}
              >
                {q}
              </button>
            ))}
          </div>
        )}

        <div className="space-y-2 border-t-2 border-dashed border-ink/30 pt-3">
          <VoiceInput label="说给教练听" onText={(t) => setInput((prev) => (prev ? prev + t : t))} />
          <div className="flex items-center gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              placeholder="吩咐教练记录，或问点什么…"
              maxLength={500}
              className="h-11 min-w-0 flex-1 rounded-full border-2 border-ink bg-paper px-4 outline-none focus:shadow-[3px_3px_0_0_#fa5f4a]"
            />
            <Btn size="md" disabled={busy || !input.trim()} onClick={() => send()}>
              发送
            </Btn>
          </div>
        </div>
        {msgs.length > 0 && (
          <button
            className="pt-2 text-[11px] text-muted-foreground"
            onClick={() => {
              persist([]);
              if (user) localStorage.removeItem(storeKey(user.id));
            }}
          >
            清空对话
          </button>
        )}
      </div>
    </Sheet>
  );
}
