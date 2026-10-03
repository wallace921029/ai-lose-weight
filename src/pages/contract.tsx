import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { api, refreshToday } from '@/lib/api';
import { toast, useAuth, useToday } from '@/lib/store';
import { Btn, Card, ConfirmSheet, Empty, Input, Sheet } from '@/components/ui-kit';
import { PledgeCard } from '@/components/pledge-card';
import { cnDate, kg } from '@/lib/format';
import type { Pledge, Contract, Stake } from '@/lib/types';

const STATUS_META: Record<string, { label: string; cls: string }> = {
  active: { label: '进行中', cls: 'bg-brand/15 text-brand-deep' },
  success: { label: '达成', cls: 'bg-good/20 text-good-deep' },
  failed: { label: '失守', cls: 'bg-brand/15 text-brand-deep' },
  skipped: { label: '未结算', cls: 'bg-secondary text-ink-soft' },
};

export default function ContractPage() {
  const { user, reload: reloadAuth } = useAuth();
  const { reload: reloadToday } = useToday();
  const nav = useNavigate();
  const [pledge, setPledge] = useState<Pledge | null>(null);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [stakes, setStakes] = useState<Stake[]>([]);
  const [tick, setTick] = useState(0);

  const [abandonOpen, setAbandonOpen] = useState(false);
  const [paySheet, setPaySheet] = useState<Stake | null>(null);
  const [proof, setProof] = useState('');
  const [denySheet, setDenySheet] = useState<Stake | null>(null);

  const load = useCallback(() => {
    api<{ pledge: Pledge | null; contracts: Contract[]; stakes: Stake[] }>('/pledge').then((r) => {
      setPledge(r.pledge);
      setContracts(r.contracts);
      setStakes(r.stakes);
    });
  }, []);
  useEffect(load, [load, tick]);

  const pending = stakes.filter((s) => s.status === 'pending');
  const history = stakes.filter((s) => s.status !== 'pending');
  const wins = contracts.filter((c) => c.status === 'success').length;

  async function payStake() {
    if (!paySheet) return;
    await api(`/stakes/${paySheet.id}/pay`, { proof_note: proof.trim() });
    toast('好汉做事好汉当，信用 +5', 'good');
    setProof('');
    setPaySheet(null);
    setTick((t) => t + 1);
    refreshToday();
  }

  return (
    <div className="space-y-3.5">
      <div className="pt-1 text-lg font-bold">契约</div>

      {/* 军令状 */}
      {pledge ? (
        <div className="space-y-3.5">
          <PledgeCard pledge={pledge} />
          {pledge.status !== 'active' && (
            <>
              <div className="-mt-1 text-center text-[12px] text-ink-soft">
                这张状已了结（{pledge.status === 'abandoned' ? '弃状' : pledge.status === 'failed' ? '到期未成' : '达成'}）。历史与信用记录保留。
              </div>
              <Btn block size="lg" onClick={() => nav('/onboarding')}>
                立一张新状
              </Btn>
            </>
          )}
        </div>
      ) : (
        <Card className="text-center">
          <div className="text-[14px] font-bold">还没有军令状</div>
          <div className="mt-1 mb-3 text-[12px] text-muted-foreground">没有状的减肥叫许愿</div>
          <Btn onClick={() => nav('/onboarding')}>立状</Btn>
        </Card>
      )}

      {pledge && (
        <Card className="flex items-center justify-around text-center">
          <div>
            <div className="tnum text-lg font-bold">{wins}</div>
            <div className="mt-0.5 text-[10px] text-muted-foreground">达成周数</div>
          </div>
          <div className="w-px bg-border" style={{ height: 24 }} />
          <div>
            <div className="tnum text-lg font-bold">{kg(pledge.start_weight - 0)}</div>
            <div className="mt-0.5 text-[10px] text-muted-foreground">起点 (kg)</div>
          </div>
          <div className="w-px bg-border" style={{ height: 24 }} />
          <div>
            <div className="tnum text-lg font-bold text-brand">{kg(pledge.target_weight)}</div>
            <div className="mt-0.5 text-[10px] text-muted-foreground">目标 (kg)</div>
          </div>
          <div className="w-px bg-border" style={{ height: 24 }} />
          <div>
            <div className="tnum text-lg font-bold">{user?.credit}</div>
            <div className="mt-0.5 text-[10px] text-muted-foreground">信用分</div>
          </div>
        </Card>
      )}

      {/* 周契约历史 */}
      <Card className="p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <span className="text-[13px] font-bold">周契约</span>
          <span className="text-[11px] text-muted-foreground">每周一至周日 · 周日晚结算</span>
        </div>
        {contracts.length === 0 && <Empty text="立状后自动生成" />}
        {contracts.map((c) => {
          const m = STATUS_META[c.status];
          return (
            <div key={c.id} className="flex items-center justify-between border-b border-border/50 px-4 py-3 last:border-0">
              <div>
                <div className="text-[13px] font-bold">
                  第 {c.week_no} 周
                  <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
                    {cnDate(c.week_start)} ~ {cnDate(c.week_end)}
                  </span>
                </div>
                <div className="tnum mt-1 text-[11px] text-muted-foreground">
                  {kg(c.start_trend)} → 目标 {kg(c.target_weight)}
                  {c.end_trend !== null && ` · 收于 ${kg(c.end_trend)}`}
                </div>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${m.cls}`}>{m.label}</span>
            </div>
          );
        })}
      </Card>

      {/* 罚金台账 */}
      <Card className="p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <span className="text-[13px] font-bold">罚金台账</span>
          <span className="text-[11px] text-muted-foreground">契约失守自动入账</span>
        </div>
        {pending.length === 0 && history.length === 0 && <Empty icon="💰" text="没有罚金记录，保持住" />}
        {pending.map((s) => (
          <div key={s.id} className="border-b border-border/50 bg-brand/5 px-4 py-3 last:border-0">
            <div className="flex items-center justify-between">
              <div>
                <div className="tnum text-[15px] font-bold text-brand">¥{Math.round(s.amount)}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {s.contract_id ? '周契约失守' : '军令状到期未成'} · {cnDate(s.created_at.slice(0, 10))}
                </div>
              </div>
              <div className="flex gap-2">
                <Btn size="sm" onClick={() => { setPaySheet(s); setProof(''); }}>
                  已缴纳
                </Btn>
                <Btn size="sm" variant="danger" onClick={() => setDenySheet(s)}>
                  赖账
                </Btn>
              </div>
            </div>
          </div>
        ))}
        {history.map((s) => (
          <div key={s.id} className="flex items-center justify-between border-b border-border/50 px-4 py-2.5 last:border-0">
            <div>
              <div className="tnum text-[13px] font-bold">¥{Math.round(s.amount)}</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                {cnDate((s.paid_at || s.created_at).slice(0, 10))}
                {s.proof_note ? ` · ${s.proof_note}` : ''}
              </div>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${s.status === 'paid' ? 'bg-good/20 text-good-deep' : 'bg-brand/15 text-brand-deep'}`}>
              {s.status === 'paid' ? '已缴清' : '赖账'}
            </span>
          </div>
        ))}
      </Card>

      {/* 危险区 */}
      {pledge?.status === 'active' && (
        <Card className="border-brand/25">
          <div className="mb-2 text-[13px] font-bold text-brand">危险区</div>
          <div className="mb-3 text-[12px] leading-relaxed text-muted-foreground">
            弃状 = 当逃兵：信用 -30，广场公开记录，历史周契约全部作废。真想清楚了再按。
          </div>
          <Btn variant="danger" block onClick={() => setAbandonOpen(true)}>
            弃状（当逃兵）
          </Btn>
        </Card>
      )}

      {/* 信用规则 */}
      <Card className="text-[12px] leading-relaxed text-muted-foreground">
        <div className="mb-1.5 text-[13px] font-bold text-foreground">信用规则</div>
        <div>周契约达成 +5 · 缴纳罚金 +5 · 军令状达成 +20</div>
        <div>周契约失守 -15 · 弃状 -30 · 赖账 -50（0~100 分）</div>
      </Card>

      {/* 弹层们 */}
      <ConfirmSheet
        open={abandonOpen}
        onClose={() => setAbandonOpen(false)}
        title="确认弃状？"
        desc="弃状后这张军令状作废，广场会留下「当逃兵」的公开记录，信用分 -30。这是整个 app 里最丢人的按钮。"
        confirmText="我确认弃状"
        danger
        requireText="弃状"
        onConfirm={async () => {
          await api('/pledge/abandon', { confirm: '弃状' });
          toast('状已弃。愿你后半生与肥肉和解。', 'error');
          setTick((t) => t + 1);
          reloadToday();
          await reloadAuth();
        }}
      />

      <Sheet open={!!paySheet} onClose={() => setPaySheet(null)} title={`缴纳罚金 ¥${paySheet ? Math.round(paySheet.amount) : 0}`}>
        <div className="pb-3 text-[12px] leading-relaxed text-muted-foreground">
          按立状时你给自己定的规矩处理这笔钱，然后在这里留个凭据（如「已捐 xx 基金」）。诚实是这套系统唯一的前提。
        </div>
        <Input value={proof} onChange={(e) => setProof(e.target.value)} maxLength={100} placeholder="凭据说明（选填）" className="mb-4" />
        <Btn block size="lg" onClick={payStake}>
          确认已缴纳
        </Btn>
      </Sheet>

      <ConfirmSheet
        open={!!denySheet}
        onClose={() => setDenySheet(null)}
        title="对这笔罚金赖账？"
        desc="赖账会留下永久的公开记录，信用分 -50。破釜允许你赖——代价是所有人都能看见。"
        confirmText="我就是要赖账"
        danger
        onConfirm={async () => {
          if (!denySheet) return;
          await api(`/stakes/${denySheet.id}/deny`);
          toast('已记录。这是你自己的选择。', 'error');
          setDenySheet(null);
          setTick((t) => t + 1);
          refreshToday();
        }}
      />
    </div>
  );
}
