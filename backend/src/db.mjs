import './env.mjs'; // 最先加载 .env（放在任何读取 process.env 的代码之前）
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, '../..');
export const DATA_DIR = process.env.DATA_DIR || path.join(ROOT_DIR, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, 'pofu.db'));
db.exec('PRAGMA journal_mode = WAL;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  nickname TEXT NOT NULL DEFAULT '',
  gender TEXT NOT NULL DEFAULT 'male',
  birth_year INTEGER NOT NULL DEFAULT 1995,
  height_cm REAL NOT NULL DEFAULT 170,
  activity REAL NOT NULL DEFAULT 1.375,
  credit INTEGER NOT NULL DEFAULT 100,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pledges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  start_weight REAL NOT NULL,
  start_date TEXT NOT NULL,
  target_weight REAL NOT NULL,
  deadline TEXT NOT NULL,
  weekly_pace REAL NOT NULL,
  stake_per_week REAL NOT NULL DEFAULT 0,
  punishment_desc TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  settled_at TEXT
);

CREATE TABLE IF NOT EXISTS contracts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pledge_id INTEGER NOT NULL REFERENCES pledges(id),
  user_id INTEGER NOT NULL,
  week_no INTEGER NOT NULL,
  week_start TEXT NOT NULL,
  week_end TEXT NOT NULL,
  expected_days INTEGER NOT NULL DEFAULT 7,
  start_trend REAL NOT NULL,
  target_weight REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  miss_days INTEGER DEFAULT 0,
  end_trend REAL,
  settled_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS weigh_ins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  weight_kg REAL NOT NULL,
  trend REAL NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  UNIQUE(user_id, date)
);

CREATE TABLE IF NOT EXISTS diet_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  meal TEXT NOT NULL DEFAULT 'snack',
  name TEXT NOT NULL,
  qty REAL NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT '份',
  calories REAL NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS exercise_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  activity TEXT NOT NULL,
  minutes INTEGER NOT NULL,
  calories REAL NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stake_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  contract_id INTEGER,
  amount REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  proof_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  paid_at TEXT
);

CREATE TABLE IF NOT EXISTS witnesses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  witness_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(user_id, witness_id)
);

CREATE TABLE IF NOT EXISTS ai_settings (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  api_key TEXT NOT NULL,
  model TEXT NOT NULL,
  base_url TEXT NOT NULL DEFAULT 'https://api.deepseek.com/v1',
  updated_at TEXT NOT NULL
);

-- 创始人配置的全局 AI 模型（三个能力各一条 JSON：{provider,model[,voice]}，凭证见 ai_providers）
CREATE TABLE IF NOT EXISTS ai_global (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  chat TEXT,
  tts TEXT,
  asr TEXT,
  updated_at TEXT NOT NULL
);
INSERT OR IGNORE INTO ai_global (id, chat, tts, asr, updated_at) VALUES (1, NULL, NULL, NULL, '');

-- 服务商凭证：一家一条（api_key + 可覆盖的 base_url），各能力共用
CREATE TABLE IF NOT EXISTS ai_providers (
  provider TEXT PRIMARY KEY,
  api_key TEXT NOT NULL,
  base_url TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS friends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  friend_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  UNIQUE(user_id, friend_id)
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_weigh_user_date ON weigh_ins(user_id, date);
CREATE INDEX IF NOT EXISTS idx_events_user ON events(user_id, id);
CREATE INDEX IF NOT EXISTS idx_contracts_user ON contracts(user_id, status);
CREATE INDEX IF NOT EXISTS idx_friends_user ON friends(user_id, status);
`);

// 旧库迁移：users 表补 role 列（新库 CREATE TABLE 已带）
try {
  db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'member'");
} catch { /* 列已存在 */ }

export function addEvent(uid, type, payload = {}) {
  db.prepare('INSERT INTO events (user_id, type, payload, created_at) VALUES (?,?,?,?)')
    .run(uid, type, JSON.stringify(payload), new Date().toISOString());
}
