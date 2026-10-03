import { db, addEvent } from './db.mjs';
import { todayStr, addDays, isoWeekStart, diffDays, round1, clamp } from './util.mjs';

// ---------- 体重趋势（EWMA，过滤水重噪音）----------

// 重算某用户全部趋势值（ weigh-in 只允许当天，追加为主，但删除当天记录后也需重算 ）
export function recomputeTrends(uid) {
  const rows = db.prepare('SELECT id, weight_kg, trend FROM weigh_ins WHERE user_id=? ORDER BY date').all(uid);
  let t = null;
  const upd = db.prepare('UPDATE weigh_ins SET trend=? WHERE id=?');
  for (const r of rows) {
    t = t === null ? r.weight_kg : t + 0.1 * (r.weight_kg - t);
    if (Math.abs(t - r.trend) > 1e-9) upd.run(t, r.id);
  }
  return t; // 最新趋势
}

export function lastTrendBefore(uid, dateIncl) {
  const row = db.prepare(
    'SELECT trend FROM weigh_ins WHERE user_id=? AND date<=? ORDER BY date DESC LIMIT 1'
  ).get(uid, dateIncl);
  return row ? row.trend : null;
}

// ---------- 连续打卡天数 ----------

export function streakOf(uid) {
  const rows = db.prepare('SELECT date FROM weigh_ins WHERE user_id=?').all(uid);
  const set = new Set(rows.map((r) => r.date));
  let d = todayStr();
  if (!set.has(d)) d = addDays(d, -1); // 今天还没称不打断连续，从昨天回溯
  let n = 0;
  while (set.has(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

// ---------- 热量 ----------

export function calcTdee({ gender, height_cm, birth_year, activity }, weightKg) {
  const age = Math.max(10, new Date().getFullYear() - birth_year);
  const base = 10 * weightKg + 6.25 * height_cm - 5 * age;
  const bmr = gender === 'female' ? base - 161 : base + 5;
  return Math.round(bmr * activity);
}

export function calcBudget(user, weightKg, weeklyPace) {
  const tdee = calcTdee(user, weightKg);
  const floor = user.gender === 'female' ? 1200 : 1500;
  return { tdee, budget: Math.round(Math.max(floor, tdee - weeklyPace * 1100)) };
}

// ---------- 契约结算引擎 ----------

function changeCredit(uid, delta) {
  db.prepare("UPDATE users SET credit=MAX(0,MIN(100,credit+?)) WHERE id=?").run(delta, uid);
}

function settleContract(c, pledge) {
  const uid = c.user_id;
  const today = todayStr();
  const weighDates = db.prepare(
    'SELECT DISTINCT date FROM weigh_ins WHERE user_id=? AND date>=? AND date<=?'
  ).all(uid, c.week_start, c.week_end).map((r) => r.date);
  const missDays = Math.max(0, c.expected_days - weighDates.length);
  const endTrend = lastTrendBefore(uid, c.week_end);
  const success = endTrend !== null && endTrend <= c.target_weight + 0.05 && missDays < 3;
  db.prepare(
    "UPDATE contracts SET status=?, miss_days=?, end_trend=?, settled_at=? WHERE id=?"
  ).run(success ? 'success' : 'failed', missDays, endTrend, new Date().toISOString(), c.id);

  if (success) {
    changeCredit(uid, +5);
    addEvent(uid, 'contract_success', {
      week_no: c.week_no,
      delta: round1(c.start_trend - endTrend),
      target: c.target_weight,
    });
    checkMilestone(uid, pledge, endTrend);
  } else {
    changeCredit(uid, -15);
    if (pledge.stake_per_week > 0) {
      db.prepare(
        "INSERT INTO stake_payments (user_id, contract_id, amount, status, created_at) VALUES (?,?,?,'pending',?)"
      ).run(uid, c.id, pledge.stake_per_week, new Date().toISOString());
    }
    addEvent(uid, 'contract_fail', {
      week_no: c.week_no,
      need: endTrend === null ? null : round1(endTrend - c.target_weight),
      miss_days: missDays,
      amount: pledge.stake_per_week,
    });
  }
}

function checkMilestone(uid, pledge, trendNow) {
  const lost = pledge.start_weight - trendNow;
  if (lost <= 0) return;
  const reached = Math.floor(lost / 5);
  const done = db.prepare(
    "SELECT COUNT(*) AS n FROM events WHERE user_id=? AND type='milestone'"
  ).get(uid).n;
  if (reached > done) {
    addEvent(uid, 'milestone', { total_lost: round1(lost), level: reached });
  }
}

// 用户任何主要请求前调用：结算过期契约 → 处理到期军令状 → 确保本周契约存在
export function settleUser(uid) {
  const pledge = db.prepare(
    "SELECT * FROM pledges WHERE user_id=? AND status='active' ORDER BY id DESC LIMIT 1"
  ).get(uid);
  if (!pledge) return;

  const overdue = db.prepare(
    "SELECT * FROM contracts WHERE pledge_id=? AND status='active' AND week_end<? ORDER BY week_start"
  ).all(pledge.id, todayStr());
  for (const c of overdue) settleContract(c, pledge);

  const today = todayStr();
  if (today > pledge.deadline) {
    // 军令状到期终局结算
    const endTrend = lastTrendBefore(uid, pledge.deadline);
    const win = endTrend !== null && endTrend <= pledge.target_weight + 0.1;
    db.prepare("UPDATE pledges SET status=?, settled_at=? WHERE id=?").run(
      win ? 'completed' : 'failed', new Date().toISOString(), pledge.id
    );
    // 未结算的最后一周不再追究（终局已裁定）
    db.prepare("UPDATE contracts SET status='skipped', settled_at=? WHERE pledge_id=? AND status='active'")
      .run(new Date().toISOString(), pledge.id);
    const lost = endTrend === null ? 0 : round1(pledge.start_weight - endTrend);
    if (win) {
      changeCredit(uid, +20);
      addEvent(uid, 'pledge_completed', { total_lost: lost, target: pledge.target_weight });
    } else {
      changeCredit(uid, -20);
      if (pledge.stake_per_week > 0) {
        db.prepare(
          "INSERT INTO stake_payments (user_id, contract_id, amount, status, created_at) VALUES (?,NULL,?,'pending',?)"
        ).run(uid, pledge.stake_per_week, new Date().toISOString());
      }
      addEvent(uid, 'pledge_failed', {
        total_lost: lost,
        remaining: endTrend === null ? null : round1(endTrend - pledge.target_weight),
      });
    }
    return;
  }

  // 确保本周契约存在
  const ws = isoWeekStart(today);
  const cur = db.prepare(
    "SELECT * FROM contracts WHERE pledge_id=? AND week_start=?"
  ).get(pledge.id, ws);
  if (!cur) {
    const trend = lastTrendBefore(uid, today);
    const base = trend === null ? pledge.start_weight : trend;
    const weekNo = db.prepare('SELECT COUNT(*) AS n FROM contracts WHERE pledge_id=?').get(pledge.id).n + 1;
    const expected = weekNo === 1
      ? diffDays(maxStr(ws, pledge.start_date), addDays(ws, 6)) + 1
      : 7;
    // 立状当周按实际天数等比折算目标，整周按全额配速
    const effDays = Math.min(7, Math.max(1, expected));
    const target = round1(base - pledge.weekly_pace * (effDays / 7));
    db.prepare(
      `INSERT INTO contracts (pledge_id,user_id,week_no,week_start,week_end,expected_days,start_trend,target_weight,status,created_at)
       VALUES (?,?,?,?,?,?,?,?, 'active', ?)`
    ).run(pledge.id, uid, weekNo, ws, addDays(ws, 6), effDays, base, target, new Date().toISOString());
  }
}

function maxStr(a, b) {
  return a > b ? a : b;
}

// ---------- 教练点评（规则驱动）----------

export function coachText(t) {
  if (t.pendingStakes > 0) {
    return `你有 ¥${Math.round(t.pendingStakes)} 罚金未缴。缴完之前，一切减重成绩不作数。`;
  }
  if (!t.weighed) return '今天还没上秤。没有数据的一天，等于白过。';
  const c = t.contract;
  if (c && c.need !== null) {
    if (c.need <= 0) return '本周目标已提前达成。保持住，别在周末翻车。';
    if (c.days_left <= 2 && c.need > 0.8) {
      return `本周还差 ${c.need}kg，只剩 ${c.days_left} 天。这两天把嘴管住，能动就动。`;
    }
    if (c.days_left <= 2) return `本周还差 ${c.need}kg，只剩 ${c.days_left} 天。少一顿宵夜就够了。`;
  }
  if (t.calorie.remaining < 0) {
    return `今日热量已超支 ${Math.round(-t.calorie.remaining)} kcal。明早轻一点，今天到此为止，别再吃了。`;
  }
  if (t.trendDelta !== null && t.trendDelta < 0) {
    return `趋势又降了 ${Math.abs(t.trendDelta)}kg。数字不会说谎，继续保持。`;
  }
  if (t.streak >= 7) return `连续打卡 ${t.streak} 天，火种在手。别让它熄在你手里。`;
  if (t.calorie.intake === 0) return `今日摄入控制在 ${t.calorie.budget} kcal 内。多喝水，睡够 7 小时。`;
  return `今日还剩 ${Math.round(t.calorie.remaining)} kcal 可以吃。别把额度留给宵夜。`;
}

export { changeCredit };
