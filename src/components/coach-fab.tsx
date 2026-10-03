import { useEffect, useRef, useState } from 'react';
import { aiCaps } from '@/lib/ai-caps';
import { ChatSheet } from './chat-sheet';

// 全局 AI 入口：可拖拽的教练头像悬浮球
// - 拖动：按住拖到任意位置，松手记住位置（localStorage）
// - 点击（位移 < 8px）：打开教练对话，可以直接吩咐「记体重 65kg」「中午吃了碗牛肉面」

const SIZE = 58;
const POS_KEY = 'pofu_fab_pos';

/** 默认停在右下角（底部导航上方） */
function defaultPos() {
  return { x: window.innerWidth - SIZE - 16, y: window.innerHeight - SIZE - 96 };
}

function loadPos() {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (!raw) return defaultPos();
    const p = JSON.parse(raw);
    if (typeof p.x !== 'number' || typeof p.y !== 'number') return defaultPos();
    return clamp(p, window.innerWidth, window.innerHeight);
  } catch {
    return defaultPos();
  }
}

function clamp(p: { x: number; y: number }, vw: number, vh: number) {
  return {
    x: Math.min(Math.max(8, p.x), vw - SIZE - 8),
    y: Math.min(Math.max(8, p.y), vh - SIZE - 8),
  };
}

/** 教练头像：军帽 + 墨镜的简笔教官 */
function CoachAvatar() {
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden>
      <circle cx="32" cy="32" r="29" fill="#fdf3df" stroke="#43352a" strokeWidth="3" />
      {/* 军帽 */}
      <path d="M17 27 Q32 13 47 27 L47 30 Q32 25 17 30 Z" fill="#fa5f4a" stroke="#43352a" strokeWidth="2.4" strokeLinejoin="round" />
      <rect x="14" y="28.5" width="36" height="5" rx="2.5" fill="#43352a" />
      {/* 墨镜 */}
      <rect x="20" y="37" width="9.5" height="7" rx="2" fill="#43352a" />
      <rect x="34.5" y="37" width="9.5" height="7" rx="2" fill="#43352a" />
      <path d="M29.5 40h5" stroke="#43352a" strokeWidth="2" />
      {/* 严肃的嘴 + 腮红 */}
      <path d="M26 51 Q32 48.5 38 51" stroke="#43352a" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <circle cx="18" cy="46" r="2.5" fill="#f7a8a0" opacity="0.8" />
      <circle cx="46" cy="46" r="2.5" fill="#f7a8a0" opacity="0.8" />
    </svg>
  );
}

export function CoachFab() {
  const [visible, setVisible] = useState(false); // AI 未配置时隐藏入口
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(() => ({ x: -999, y: -999 })); // 首帧在 effect 里定位，避免 SSR/初始闪跳
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);

  useEffect(() => {
    aiCaps().then((c) => setVisible(!!c.enabled));
    setPos(loadPos());
    const onResize = () => setPos((p) => clamp(p, window.innerWidth, window.innerHeight));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y, moved: false };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) < 8) return; // 位移小于阈值视为点击
    d.moved = true;
    setDragging(true);
    setPos(clamp({ x: d.ox + dx, y: d.oy + dy }, window.innerWidth, window.innerHeight));
  }

  function onPointerUp() {
    const d = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    if (!d) return;
    if (d.moved) {
      setPos((p) => {
        const c = clamp(p, window.innerWidth, window.innerHeight);
        localStorage.setItem(POS_KEY, JSON.stringify(c));
        return c;
      });
    } else {
      setOpen(true);
    }
  }

  if (!visible) return null;

  return (
    <>
      <button
        type="button"
        aria-label="AI 教练"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ left: pos.x, top: pos.y, width: SIZE, height: SIZE, touchAction: 'none' }}
        className={`wob fixed z-40 select-none border-2 border-ink bg-paper p-0.5 ink-shadow press ${
          dragging ? 'scale-110 opacity-80' : 'wiggle'
        }`}
      >
        <CoachAvatar />
      </button>
      <ChatSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
