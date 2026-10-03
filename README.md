# Pofu 破釜 · The Weight-Loss Pledge

**English** | [简体中文](README.zh-CN.md)

> The diet app that burns your escape route. Ordinary weight-loss apps are just trackers — Pofu is a **behavioral constraint system**: a signed pledge, weekly contracts, a penalty ledger, credit scores, a public square, and witnesses.

Mobile-first PWA — add it to your home screen and use it like a native app.

## Why it can hold you accountable

| Mechanism | Rule |
| --- | --- |
| **The Pledge** | After signing up, press and hold for 2 seconds to sign: target weight, deadline, weekly pace, penalty amount and where it goes — in black and white, under a red seal |
| **Daily weigh-in** | Step on the scale every morning; history is immutable. Miss a day and your flame goes out; miss ≥3 days in a week and the week is automatically ruled a failure |
| **Weekly contract** | Auto-generated every Monday: this week's trend line must reach "last week's trend − pace". Settled Sunday night — falling short by even 0.1 kg is a breach |
| **Penalty ledger** | Breach a contract and the penalty is booked automatically. You must personally mark it "Paid" or "Defaulted" — defaulting costs −50 credit and is published on the square |
| **Credit score** | 0–100. Weekly success +5, paying a penalty +5, final success +20; breach −15, abandoning the pledge −30, defaulting −50 |
| **The Square** | Everyone's check-ins, wins, losses and defaults are public events (actual weights never shown), ranked by credit score |
| **Witnesses** | Designate other users to witness you — your failures surface first in their square |
| **Abandonment** | Deserting is allowed, at the cost of −30 credit and a permanent public "deserter" record |

Weight is judged by an **EWMA trend line** (filtering water-weight noise); the calorie budget follows **Mifflin-St Jeor TDEE − pace deficit**, with a built-in library of 120+ common foods and 29 exercises.

## AI Integration (multi-provider, configured once by the founder)

**All AI models are configured by the founder account** and shared camp-wide. Entry: Me → AI Coach · Model Config (a dedicated page with a two-level structure):

1. **Providers**: one API key per provider (remotely validated on save; official endpoints by default, customizable) — one provider's key can serve multiple capabilities
2. **Capability assignment**: bind chat / TTS / ASR each to a configured provider and pick from its live model list (TTS includes voice selection); deleting a provider automatically clears capabilities bound to it

- **Chat model**: coach daily briefing / coach chat / AI food logging / AI exercise logging
- **TTS**: the 🔊 "Listen" button on the Today-page coach briefing
- **ASR**: 🎙 voice-to-text in the food/exercise sheets (falls back to the browser's Web Speech API when unconfigured)

Six official providers built in (OpenAI-compatible, custom endpoints supported):

| Provider | Chat | TTS | ASR |
| --- | --- | --- | --- |
| Alibaba Cloud Bailian (DashScope) | qwen series | cosyvoice | paraformer / sensevoice |
| Moonshot Kimi | kimi series | — | — |
| Zhipu BigModel | glm series | cogtts | glm-asr |
| DeepSeek | deepseek-chat / reasoner | — | — |
| Volcano Ark | doubao series | doubao-tts | doubao-asr |
| Xiaomi MiMo | MiMo series | MiMo-TTS | — |

- Keys live only in the server database; the frontend shows masked values only, and every call is proxied through the backend
- On save, the backend remotely validates the key and model (skipped for providers that don't expose `/models`)
- All three capabilities are optional: without chat, the rule-based coach takes over; without TTS/ASR the buttons hide themselves
- The server can also provide a **global fallback** chat model via environment variables (used when nothing is configured in-app): `AI_BASE_URL=… AI_API_KEY=… AI_MODEL=…`

The chat entry point is a **globally draggable coach avatar** (hidden when AI is unconfigured): tap to chat, or just tell it to log for you — "log my weight, 65 kg", "had a bowl of spiced beef noodles for lunch", "ran for half an hour at dusk". The coach detects the intent and pops a **card-style confirmation** (weight 65.0 kg / food items and calories / exercise minutes and burn); nothing is recorded until you tap "Confirm", and cancel records nothing; casual questions are answered as normal chat. The avatar can be dragged anywhere on screen and its position is remembered.

Quotas (abuse protection): food/exercise parsing and coach commands combined 40/day/person, chat 80 messages/day/person, TTS 30/day/person, ASR 60/day/person.

## Accounts (founder + invite-code registration)

Configure in the project root `.env` (see `.env.example`; restart to apply):

```bash
# Founder: the only account allowed to configure AI models; auto-created/re-passworded on startup
FOUNDER_USERNAME=founder
FOUNDER_PASSWORD=pick-a-hard-password

# Registration invite codes: comma-separated, multiple allowed; unset = registration fully closed
INVITE_CODE=POFU-2026,friends-only

# JWT secret (must change in production)
JWT_SECRET=a-long-random-string
```

- Everyone else signs up with a valid invite code (entered on the Register · Enlist page), case-insensitive
- The founder has a "Founder" badge on the Me page; the AI config entry is founder-only
- `.env` is gitignored and never committed; under Docker, inject via environment variables (they take precedence over `.env`)

## Friends & the daily rivalry board

Square → Friends: send a request by username → the other side accepts (mutual requests auto-match) → the **daily rivalry board**. Friends compare these every day:

| Visible | Never visible (privacy) |
| --- | --- |
| Checked in today, streak length, credit score, today's exercise minutes, calorie discipline (✓ / over), weekly contract status | **Weight, trend, targets and actual calorie figures** are never visible between friends |

The square feed also has a "friends only" filter; becoming friends posts a public 🤝 event.

## Quick Start (local development)

```bash
npm install                     # frontend deps
npm --prefix backend install    # backend deps
npm run dev                     # starts vite (5173) + API (3000) together
```

Production mode (single process, the backend serves the built assets):

```bash
npm run build
npm start                       # http://localhost:3000
```

Demo data (three demo accounts with history):

```bash
npm run seed
# demo1 / demo123456   铁头娃 Iron Head (30-day streak, 4 successful weeks, perfect credit)
# demo2 / demo123456   阿香 A-Xiang (steady progress)
# demo3 / demo123456   老K Old K (breached last week, ¥100 penalty unpaid)
```

Tests: `npm test` (settlement-engine unit tests + full HTTP smoke + full AI pipeline — 12 tests)

## Docker Deployment

```bash
JWT_SECRET=$(openssl rand -hex 32) docker compose up -d --build
```

- Visit `http://<server-ip>:3000`
- SQLite data persists in `./data/` (backing up this directory backs up everything)
- Environment variables: `JWT_SECRET` (must change in production), `TZ` (defaults to Asia/Shanghai)

## Add to Home Screen

- **iOS Safari**: Share button → Add to Home Screen
- **Android Chrome**: menu ⋮ → Install app

The Me page has step-by-step guidance; after installing, the app runs in its own window, and the app shell opens offline (data needs a connection).

## Tech Stack

```
frontend  React 19 + TypeScript + Vite + Tailwind v4 (mobile-first, hand-written components, no UI framework)
backend   Node.js 24 + Express + node:sqlite (built-in SQLite, zero native dependencies) + JWT multi-user auth
deploy    Docker multi-stage + docker-compose, volume-mounted data
```

Key directories:

```
backend/src/logic.mjs     settlement engine: weekly contract settlement, final ruling, EWMA trend, TDEE, coach copy
backend/src/routes.mjs    all REST APIs (zod-validated)
src/pages/                Today / Log / Contract / Square / Me / Enlist & Pledge
src/components/           pledge card (seal), weight curve (SVG), calorie ring, bottom sheets
scripts/                  icon generation (pure-Node PNG encoding), demo seed
```

## Privacy

By signing up you agree that weigh-ins, contract outcomes and credit scores are published on the square as events; **actual weight numbers are never public**. All data stays on your own server.

This app does not provide medical advice. Losing more than 1 kg per week carries health risks; the app warns about this in-app.
