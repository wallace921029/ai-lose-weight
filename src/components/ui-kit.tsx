import {
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { cn } from 'cn';

// ---------- 品牌标识：下降阶梯（手绘贴纸版） ----------

export function Logo({ size = 28, className }: { size?: number; className?: string }) {
  const bars = [300, 240, 185, 135, 90];
  const colors = ['#9ed3f3', '#ffd97a', '#ffc2a1', '#ff9d87', '#ff6b5b'];
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" className={className}>
      <rect x="10" y="10" width="492" height="492" rx="116" fill="#fffdf6" stroke="#43352a" strokeWidth="20" />
      {bars.map((h, i) => (
        <rect
          key={i}
          x={98 + i * 68}
          y={356 - h}
          width={44}
          height={h}
          rx={14}
          fill={colors[i]}
          stroke="#43352a"
          strokeWidth="9"
        />
      ))}
      {/* 最矮一级的笑脸 */}
      <circle cx="386" cy="300" r="4.5" fill="#43352a" />
      <circle cx="404" cy="300" r="4.5" fill="#43352a" />
      <path
        d="M386 314 Q 395 322 404 314"
        fill="none"
        stroke="#43352a"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      {/* 手绘基线 */}
      <line x1="82" y1="374" x2="430" y2="374" stroke="#43352a" strokeWidth="10" strokeLinecap="round" strokeDasharray="26 14" />
    </svg>
  );
}

// ---------- 按钮 ----------

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'outline' | 'danger' | 'paper';
  size?: 'md' | 'lg' | 'sm';
  block?: boolean;
}

export function Btn({ variant = 'primary', size = 'md', block, className, ...props }: BtnProps) {
  const shadowed = variant !== 'ghost';
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-1.5 font-semibold select-none',
        'disabled:pointer-events-none disabled:opacity-45',
        size === 'lg' && 'h-13 px-6 text-base',
        size === 'md' && 'h-11 px-5 text-[15px]',
        size === 'sm' && 'h-8 px-3.5 text-[13px]',
        shadowed && 'wob-sm border-2 border-ink ink-shadow-xs press',
        variant === 'primary' && 'bg-brand text-white active:bg-brand-deep',
        variant === 'ghost' && 'text-ink-soft active:bg-secondary',
        variant === 'outline' && 'bg-paper text-ink active:bg-paper-2',
        variant === 'danger' && 'bg-[#ffe3de] text-brand-deep active:bg-brand-soft',
        variant === 'paper' && 'bg-ink text-paper active:opacity-80',
        block && 'w-full',
        className,
      )}
      {...props}
    />
  );
}

// ---------- 输入 ----------

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-12 w-full wob-sm border-2 border-ink bg-paper px-4 text-ink placeholder:text-ink-soft/60',
        'outline-none transition-shadow focus:shadow-[3px_3px_0_0_#fa5f4a]',
        className,
      )}
      {...props}
    />
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="shrink-0 text-[14px] font-medium text-ink">{label}</span>
        {hint && <span className="min-w-0 truncate text-[11px] text-ink-soft">{hint}</span>}
      </div>
      {children}
    </label>
  );
}

// ---------- 卡片 ----------

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('wob border-2 border-ink bg-paper p-4 ink-shadow-xs', className)}>{children}</div>
  );
}

// ---------- 分段选择 ----------

export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  className?: string;
}) {
  return (
    <div className={cn('inline-flex gap-1 wob-sm border-2 border-ink bg-paper-2 p-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'cursor-pointer touch-manipulation wob-sm px-3.5 py-1.5 text-[13px] font-medium transition-all active:scale-95',
            value === o.value
              ? 'border-2 border-ink bg-brand font-bold text-white ink-shadow-xs'
              : 'border-2 border-transparent text-ink-soft active:bg-cream',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------- 底部弹层 ----------

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-ink/50 backdrop-blur-[2px] [touch-action:none]" onClick={onClose} />
      <div className="animate-in slide-in-from-bottom-4 fade-in absolute inset-x-0 bottom-0 rounded-t-[32px] border-x-2 border-t-2 border-ink bg-paper pb-safe shadow-[0_-4px_0_0_rgba(67,53,42,0.12)]">
        <div className="flex justify-center pt-2.5">
          {/* 手绘波浪把手 */}
          <svg width="64" height="8" viewBox="0 0 64 8" fill="none" stroke="#43352a" strokeWidth="2.6" strokeLinecap="round">
            <path d="M2 5 Q 6 1.5, 10 5 T 18 5 T 26 5 T 34 5 T 42 5 T 50 5 T 58 5 T 62 5" />
          </svg>
        </div>
        {title && (
          <div className="flex items-center justify-between px-5 pt-2 pb-1">
            <div className="squiggle text-base font-bold">{title}</div>
            <button
              onClick={onClose}
              className="flex size-8 items-center justify-center rounded-full border-2 border-ink bg-paper-2 text-ink press"
              aria-label="关闭"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        )}
        <div className="max-h-[76vh] overflow-y-auto px-5 pt-1 pb-6">{children}</div>
      </div>
    </div>
  );
}

// ---------- 确认弹层（危险操作） ----------

export function ConfirmSheet({
  open,
  onClose,
  onConfirm,
  title,
  desc,
  confirmText = '确认',
  danger,
  requireText,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  desc?: ReactNode;
  confirmText?: string;
  danger?: boolean;
  requireText?: string;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setText('');
  }, [open]);
  const ok = !requireText || text.trim() === requireText;
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {desc && <div className="pt-1 pb-4 text-sm leading-relaxed text-ink-soft">{desc}</div>}
      {requireText && (
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`输入「${requireText}」确认`}
          className="mb-4"
        />
      )}
      <div className="flex gap-2.5">
        <Btn variant="outline" block onClick={onClose}>
          再想想
        </Btn>
        <Btn
          block
          disabled={!ok || busy}
          className={danger ? 'bg-brand-deep' : ''}
          onClick={async () => {
            setBusy(true);
            try {
              await onConfirm();
              onClose();
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? '处理中…' : confirmText}
        </Btn>
      </div>
    </Sheet>
  );
}

// ---------- 长按立状按钮 ----------

export function HoldButton({
  holdMs = 1600,
  onDone,
  children,
}: {
  holdMs?: number;
  onDone: () => void;
  children: ReactNode;
}) {
  const [p, setP] = useState(0);
  const raf = useRef(0);
  const start = useRef(0);
  const done = useRef(false);

  const stop = () => {
    cancelAnimationFrame(raf.current);
    if (!done.current) setP(0);
  };
  const tick = () => {
    const pct = Math.min(1, (performance.now() - start.current) / holdMs);
    setP(pct);
    if (pct >= 1) {
      done.current = true;
      navigator.vibrate?.(60);
      onDone();
      setTimeout(() => {
        setP(0);
        done.current = false;
      }, 600);
      return;
    }
    raf.current = requestAnimationFrame(tick);
  };
  const begin = (e: React.PointerEvent) => {
    e.preventDefault();
    done.current = false;
    start.current = performance.now();
    raf.current = requestAnimationFrame(tick);
  };

  return (
    <button
      onPointerDown={begin}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      className="wob relative h-14 w-full overflow-hidden border-2 border-ink bg-paper text-lg font-bold text-ink select-none touch-none ink-shadow-lg press"
    >
      <div
        className="absolute inset-y-0 left-0 bg-brand transition-none"
        style={{ width: `${p * 100}%` }}
      />
      <span className="relative z-10 flex h-full items-center justify-center gap-2">
        {p === 0 ? children : p < 1 ? `按住别松… ${Math.round(p * 100)}%` : '立状！'}
      </span>
    </button>
  );
}

// ---------- 小组件 ----------

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const palette = ['#ffb0a3', '#ffd08a', '#a5e3c2', '#aadaf7', '#d7c0f5', '#f9b8cd'];
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.codePointAt(0)!) >>> 0;
  const bg = palette[hash % palette.length];
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full border-2 border-ink font-bold text-ink"
      style={{ width: size, height: size, background: bg, fontSize: size * 0.42 }}
    >
      {name.slice(0, 1)}
    </div>
  );
}

export function StreakFlame({ n, size = 'md' }: { n: number; size?: 'sm' | 'md' | 'lg' }) {
  const lit = n > 0;
  return (
    <div className="flex items-center gap-1">
      <svg
        viewBox="0 0 24 24"
        className={cn(lit && 'flame', size === 'sm' && 'size-4', size === 'md' && 'size-5', size === 'lg' && 'size-8')}
        fill={lit ? '#ff8a3d' : '#d3c3ab'}
        stroke="#43352a"
        strokeWidth="1.4"
      >
        <path d="M12 2c.5 3.5-1.2 4.8-2.6 6.4C8 10 7 11.6 7 14a5 5 0 0 0 10 0c0-1.4-.5-2.5-1.2-3.6-.3 1-1 1.8-2 2.1.3-2.3-.5-4.4-1.8-6.1C11 5.4 11.7 3.6 12 2z" />
      </svg>
      <span className={cn('tnum font-bold', size === 'sm' && 'text-xs', size === 'md' && 'text-sm', size === 'lg' && 'text-2xl', lit ? 'text-ember' : 'text-ink-soft')}>
        {n}
      </span>
    </div>
  );
}

export function CreditBadge({ v }: { v: number }) {
  const tone =
    v >= 80
      ? 'text-good-deep bg-good/20 border-good'
      : v >= 50
        ? 'text-[#b26a00] bg-warn/20 border-warn'
        : 'text-brand-deep bg-brand/15 border-brand';
  return (
    <span className={cn('tnum rounded-full border-2 px-2 py-0.5 text-[11px] font-bold', tone)}>信用 {v}</span>
  );
}

export function Empty({ icon, text }: { icon?: ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2.5 py-14 text-center text-ink-soft">
      {icon ? (
        <div className="text-3xl opacity-70">{icon}</div>
      ) : (
        /* 手绘小脸：左眼 wink */
        <svg width="46" height="46" viewBox="0 0 48 48" className="wiggle" fill="none">
          <circle cx="24" cy="24" r="19" fill="#fffdf6" stroke="#43352a" strokeWidth="2.6" />
          <path d="M14 21.5 h5" stroke="#43352a" strokeWidth="2.6" strokeLinecap="round" />
          <circle cx="33" cy="21" r="2.4" fill="#43352a" />
          <path d="M16 30 Q 24 36 32 30" stroke="#43352a" strokeWidth="2.6" strokeLinecap="round" />
        </svg>
      )}
      <div className="text-sm">{text}</div>
    </div>
  );
}
