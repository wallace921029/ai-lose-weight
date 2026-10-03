export interface User {
  id: number;
  username: string;
  nickname: string;
  gender: 'male' | 'female';
  birth_year: number;
  height_cm: number;
  activity: number;
  credit: number;
  streak: number;
  role: 'founder' | 'member';
  created_at: string;
}

// ---------- AI 配置（创始人） ----------

export type AiSlot = 'chat' | 'tts' | 'asr';

export interface SlotStatus {
  enabled: boolean;
  provider?: string;
  providerName?: string;
  model?: string;
  maskedKey?: string;
  baseUrl?: string;
  voice?: string | null;
  source?: string;
}

export interface AiSettings {
  role: string;
  chat: SlotStatus;
  tts: SlotStatus;
  asr: SlotStatus;
}

export interface Pledge {
  id: number;
  start_weight: number;
  start_date: string;
  target_weight: number;
  deadline: string;
  weekly_pace: number;
  stake_per_week: number;
  punishment_desc: string;
  status: 'active' | 'completed' | 'failed' | 'abandoned';
  created_at: string;
  settled_at?: string | null;
}

export interface Contract {
  id: number;
  week_no: number;
  week_start: string;
  week_end: string;
  expected_days: number;
  start_trend: number;
  target_weight: number;
  status: 'active' | 'success' | 'failed' | 'skipped';
  miss_days: number;
  end_trend: number | null;
  settled_at?: string | null;
}

export interface Stake {
  id: number;
  contract_id: number | null;
  amount: number;
  status: 'pending' | 'paid' | 'denied';
  proof_note: string;
  created_at: string;
  paid_at?: string | null;
}

export interface Today {
  date: string;
  weighed: boolean;
  weight: number | null;
  note: string;
  trend: number | null;
  trendDelta: number | null;
  streak: number;
  credit: number;
  pendingStakes: number;
  calorie: {
    tdee: number;
    budget: number;
    intake: number;
    burned: number;
    remaining: number;
  };
  pledge: {
    id: number;
    start_weight: number;
    start_date: string;
    target_weight: number;
    deadline: string;
    weekly_pace: number;
    stake_per_week: number;
    punishment_desc: string;
  } | null;
  contract: {
    week_no: number;
    week_start: string;
    week_end: string;
    start_trend: number;
    target_weight: number;
    current_trend: number | null;
    need: number | null;
    days_left: number;
    expected_days: number;
  } | null;
  totals: {
    lost: number;
    remaining_kg: number;
    days_to_deadline: number;
    total_weeks: number;
  } | null;
  coach: string;
}

export interface DietLog {
  id: number;
  date: string;
  meal: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  name: string;
  qty: number;
  unit: string;
  calories: number;
}

export interface ExerciseLog {
  id: number;
  date: string;
  activity: string;
  minutes: number;
  calories: number;
}

export interface WeightPoint {
  date: string;
  weight: number;
  trend: number;
}

export interface Food {
  name: string;
  kcal: number;
  unit: string;
}

export interface Exercise {
  name: string;
  met: number;
}

export type EventType =
  | 'checkin'
  | 'contract_success'
  | 'contract_fail'
  | 'stake_paid'
  | 'stake_denied'
  | 'pledge_created'
  | 'pledge_completed'
  | 'pledge_failed'
  | 'pledge_abandoned'
  | 'milestone'
  | 'friendship'
  | 'diet'
  | 'exercise';

export interface FeedEvent {
  id: number;
  type: EventType;
  payload: Record<string, any>;
  created_at: string;
  user: { id: number; username: string; nickname: string };
}

export interface LeaderItem {
  id: number;
  username: string;
  nickname: string;
  credit: number;
  streak: number;
  wins: number;
}

