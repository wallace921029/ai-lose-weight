import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { api } from '@/lib/api';
import { toast, useAuth, useToday } from '@/lib/store';
import { Avatar, Btn, Card, Field, Input, Segmented, Sheet } from '@/components/ui-kit';
import { Logo } from '@/components/ui-kit';
import { AiSettingsSheet } from '@/components/ai-settings-sheet';
import type { AiSettings } from '@/lib/types';
import { DoodleFigure, bmiCategory } from '@/components/doodle-figure';
import { kg } from '@/lib/format';

const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

const FACTS = [
  '1kg 脂肪 ≈ 7700 kcal，每周 0.5kg = 每天亏空 550 kcal',
  '体重每天波动 1~2kg 都是水，看趋势线，别看单日',
  '少吃不能少于基础代谢，否则掉肌肉、暴食反弹',
  '本应用不提供医疗建议，胖瘦自负，健康第一',
];

/** 设置列表行：图标 + 标题 + 右侧内容（可选箭头） */
function ListRow({
  icon,
  label,
  right,
  onClick,
  last,
}: {
  icon: ReactNode;
  label: string;
  right?: ReactNode;
  onClick?: () => void;
  last?: boolean;
}) {
  const inner = (
    <>
      <span className="w-7 shrink-0 text-center text-lg" aria-hidden>
        {icon}
      </span>
      <span className="min-w-0 flex-1 text-[15px] font-bold">{label}</span>
      {right}
      {onClick && (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8f7c66" strokeWidth="2.4" strokeLinecap="round" className="shrink-0">
          <path d="M9 5l7 7-7 7" />
        </svg>
      )}
    </>
  );
  const cls = `flex w-full items-center gap-2.5 px-4 py-3.5 ${last ? '' : 'border-b-2 border-dashed border-ink/20'} ${onClick ? 'cursor-pointer active:bg-cream' : ''}`;
  return onClick ? (
    <button type="button" className={cls} onClick={onClick}>
      {inner}
    </button>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

export default function MePage() {
  const { user, logout, reload } = useAuth();
  const nav = useNavigate();
  const { today } = useToday();
  const [aiStatus, setAiStatus] = useState<AiSettings | null>(null);
  const [aiSheetOpen, setAiSheetOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [factsOpen, setFactsOpen] = useState(false);

  const isFounder = user?.role === 'founder';

  const loadAi = () => {
    api<AiSettings>('/ai/settings').then(setAiStatus).catch(() => {});
  };

  useEffect(loadAi, []);
  const u = user as NonNullable<typeof user>; // useState 初值仅首渲染读取，守卫在下方
  const [editOpen, setEditOpen] = useState(false);
  const [nickname, setNickname] = useState(u.nickname || '');
  const [gender, setGender] = useState<'male' | 'female'>(u.gender);
  const [height, setHeight] = useState(String(u.height_cm || 170));
  const [birthYear, setBirthYear] = useState(String(u.birth_year || 1995));
  const [activity, setActivity] = useState(u.activity);

  if (!user) return null;

  // BMI 优先用今天实称（更新立即生效），今天没上秤时退回趋势估计
  const weight = today?.weight ?? today?.trend ?? null;
  const weightLabel = today?.weight != null ? '实称' : '趋势';
  const bmi = weight && user.height_cm ? weight / (user.height_cm / 100) ** 2 : null;
  const bmiCat = bmi !== null ? bmiCategory(bmi) : null;

  const standalone =
    window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;

  async function saveProfile() {
    try {
      await api('/profile', {
        method: 'PUT',
        body: {
          nickname: nickname.trim() || u.username,
          gender,
          height_cm: parseFloat(height),
          birth_year: parseInt(birthYear),
          activity,
        },
      });
      await reload();
      toast('已保存', 'good');
      setEditOpen(false);
    } catch (e: any) {
      toast(e.message, 'error');
    }
  }

  const aiPill = aiStatus ? (
    !aiStatus.chat.enabled ? (
      <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold text-ink-soft">未配置</span>
    ) : (
      <span className="max-w-40 truncate rounded-full bg-good/20 px-2 py-0.5 text-[10px] font-bold text-good-deep">
        {aiStatus.chat.source === 'env' ? '全局配置' : `${aiStatus.chat.providerName}·${aiStatus.chat.model}`}
      </span>
    )
  ) : null;

  return (
    <div className="space-y-3.5">
      <div className="pt-1 text-lg font-bold">我的</div>

      {/* 档案卡：头像资料 + 三项数据合一 */}
      <Card>
        <div className="flex items-center gap-3.5">
          <Avatar name={user.nickname || user.username} size={54} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-lg font-bold">{user.nickname || user.username}</span>
              {isFounder && (
                <span className="shrink-0 rounded-full border-2 border-ink bg-brand px-1.5 py-0.5 text-[9px] font-bold text-white">
                  创始人
                </span>
              )}
            </div>
            <div className="text-[12px] text-ink-soft">@{user.username}</div>
          </div>
          <Btn variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            编辑
          </Btn>
        </div>
        <div className="doodle-line my-3.5" />
        {bmi !== null && bmiCat && (
          <div className="flex items-center gap-4 pb-1">
            <DoodleFigure bmi={bmi} gender={user.gender} size={86} className="wiggle shrink-0" />
            <div className="min-w-0">
              <div className="text-[11px] text-ink-soft">体质指数 BMI</div>
              <div className="tnum text-3xl font-bold leading-tight">{bmi.toFixed(1)}</div>
              <span className={`mt-1 inline-block rounded-full border-2 px-2 py-0.5 text-[11px] font-bold ${bmiCat.pill}`}>
                {bmiCat.label}
              </span>
              <div className="mt-1.5 text-[11px] text-ink-soft">
                {weightLabel} {kg(weight!)}kg · {user.height_cm}cm
              </div>
            </div>
          </div>
        )}
        {bmi !== null && <div className="doodle-line my-3.5" />}
        <div className="flex items-center justify-around text-center">
          <div>
            <div className="tnum text-xl font-bold">{user.credit}</div>
            <div className="mt-0.5 text-[10px] text-ink-soft">信用分</div>
          </div>
          <div className="h-7 w-0.5 rounded-full bg-ink/15" />
          <div>
            <div className="tnum text-xl font-bold">{user.height_cm}cm</div>
            <div className="mt-0.5 text-[10px] text-ink-soft">身高</div>
          </div>
          <div className="h-7 w-0.5 rounded-full bg-ink/15" />
          <div>
            <div className="tnum text-xl font-bold">{new Date().getFullYear() - user.birth_year}</div>
            <div className="mt-0.5 text-[10px] text-ink-soft">岁</div>
          </div>
        </div>
      </Card>

      {/* 设置列表 */}
      <Card className="p-0">
        <ListRow icon="🎖️" label={isFounder ? 'AI 教练 · 模型配置' : 'AI 教练'} right={aiPill} onClick={() => (isFounder ? nav('/ai-config') : setAiSheetOpen(true))} />
        <ListRow
          icon="📲"
          label="添加到主屏幕"
          right={
            standalone ? (
              <span className="rounded-full bg-good/20 px-2 py-0.5 text-[10px] font-bold text-good-deep">已安装 ✓</span>
            ) : undefined
          }
          onClick={standalone ? undefined : () => setInstallOpen(true)}
        />
        <ListRow icon="💡" label="几句实话" onClick={() => setFactsOpen(true)} last />
      </Card>

      <Btn variant="outline" block onClick={logout}>
        退出登录
      </Btn>
      <div className="pb-2 text-center text-[10px] text-ink-soft/60">
        破釜 v1.5 · 数据存于自建服务器
      </div>

      {/* AI 状态弹层（普通用户只读；创始人跳 /ai-config 配置页） */}
      <AiSettingsSheet open={aiSheetOpen} onClose={() => { setAiSheetOpen(false); loadAi(); }} />

      {/* 添加到主屏幕步骤 */}
      <Sheet open={installOpen} onClose={() => setInstallOpen(false)} title="添加到主屏幕">
        <div className="flex items-center gap-3 pb-1">
          <Logo size={42} />
          <div className="text-[13px] leading-snug">
            把<b>破釜</b>加到主屏幕，<br />
            每天一开就是它
          </div>
        </div>
        <div className="doodle-line my-3.5" />
        {isIOS ? (
          <ol className="list-none space-y-3">
            {['点 Safari 底部的「分享」按钮', '往下滑，找到「添加到主屏幕」', '点「添加」，桌面会出现破釜图标'].map((s, i) => (
              <li key={i} className="flex items-center gap-3 text-[13px] leading-relaxed">
                <span className="tnum flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-paper-2 text-[11px] font-bold">
                  {i + 1}
                </span>
                {s}
              </li>
            ))}
          </ol>
        ) : (
          <ol className="list-none space-y-3">
            {['点浏览器右上角「⋮」菜单', '选「安装应用」/「添加到主屏幕」', '桌面会出现破釜图标'].map((s, i) => (
              <li key={i} className="flex items-center gap-3 text-[13px] leading-relaxed">
                <span className="tnum flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-paper-2 text-[11px] font-bold">
                  {i + 1}
                </span>
                {s}
              </li>
            ))}
          </ol>
        )}
      </Sheet>

      {/* 减重常识 */}
      <Sheet open={factsOpen} onClose={() => setFactsOpen(false)} title="几句实话">
        <ul className="space-y-3">
          {FACTS.map((f, i) => (
            <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed">
              <span className="shrink-0 text-brand-deep">✦</span>
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </Sheet>

      {/* 编辑资料 */}
      <Sheet open={editOpen} onClose={() => setEditOpen(false)} title="编辑资料">
        <div className="space-y-4">
          <Field label="昵称">
            <Input value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={20} />
          </Field>
          <Field label="性别">
            <Segmented
              value={gender}
              onChange={setGender}
              options={[
                { value: 'male', label: '男' },
                { value: 'female', label: '女' },
              ]}
            />
          </Field>
          <Field label="出生年份">
            <Input value={birthYear} onChange={(e) => setBirthYear(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" />
          </Field>
          <Field label="身高 (cm)">
            <Input value={height} onChange={(e) => setHeight(e.target.value)} inputMode="decimal" />
          </Field>
          <Field label="日常活动量">
            <Segmented
              value={activity}
              onChange={setActivity}
              options={[
                { value: 1.2, label: '久坐' },
                { value: 1.375, label: '轻度' },
                { value: 1.55, label: '中度' },
                { value: 1.725, label: '高强度' },
              ]}
            />
          </Field>
          <Btn block size="lg" onClick={saveProfile}>
            保存
          </Btn>
        </div>
      </Sheet>
    </div>
  );
}
