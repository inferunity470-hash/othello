# Bid Othello / ビッド式オセロ

> **Othello, but every move is decided by a sealed-bid auction.**
> 着手権を「秘密入札」で奪い合う、対人戦特化型の新感覚オセロ。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![PWA](https://img.shields.io/badge/PWA-installable-5A0FC8.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6.svg)
![React 18](https://img.shields.io/badge/React-18-61DAFB.svg)
![Vite](https://img.shields.io/badge/Vite-5-646CFF.svg)

**Play now → <https://othello-tau-nine.vercel.app>**

![Hotseat gameplay](docs/hotseat.gif) <!-- TODO: add asset -->

---

## What's special?

- **All-pay sealed-bid auction** — every turn, both players secretly bid chips for the right to play the next stone. The loser still forfeits the bid.
- **A first-of-its-kind bidding Othello** — prior-art covers bidding chess, but no production-grade bidding Othello has shipped before (to our knowledge).
- **Three game modes** — hotseat (pass-and-play), solo vs NPC (4 levels), and online multiplayer with room codes.
- **PWA** — installable, works offline for hotseat and NPC play, no account required.
- **No ads, no IAP, no tracking.**

Standard Othello rules apply for flips; what changes is *who* gets to play, and *how much it costs*.

## Game modes

| Mode | Players | Server | Notes |
|---|---|---|---|
| **Hotseat** | 2 humans, same device | None | Hidden-bid UI (`HandoffOverlay`) so neither side sees the other's amount. |
| **Online** | 2 humans, anywhere | WebSocket | 6-digit room codes. Reconnect, rematch, spectate, canned-phrase chat. |
| **Solo vs NPC** | 1 human + AI | None | 4 levels: Beginner / Intermediate / Advanced / **Oni** (PVS + endgame solver). |

Three auction formats are selectable: first-price, second-price (Vickrey), and **all-pay** (default).

## Quickstart

```bash
git clone https://github.com/inferunity470-hash/othello.git
cd othello
npm install
npm run start       # web (5173) + ws (8787) together
```

Open <http://localhost:5173> in two tabs/browsers to test online play locally.

**Requirements:** Node.js >= 20, npm >= 10.

### Common scripts

```bash
npm run dev         # web only — hotseat / NPC are fully playable
npm run server      # WebSocket server only (port 8787)
npm run build       # production build to dist/
npm run preview     # preview production build at :4173
npm run test        # vitest (212+ unit tests)
npm run test:e2e    # Playwright E2E
npm run verify      # typecheck + lint + test + build
```

## Architecture

- **Frontend** — React 18 + TypeScript (strict) + Vite + `vite-plugin-pwa`. State is local; no global store needed.
- **Backend** — Node.js + `ws` WebSocket server (`server/index.ts`). Room state is in-memory, ephemeral, discarded on disconnect. No DB, no auth.
- **AI** — α-β / PVS search with iterative deepening and endgame solver (Oni level). All inference runs in the browser.
- **Testing** — Vitest for unit/integration, Playwright for E2E.
- **Mobile** — Capacitor scaffolding (iOS) is included for a future native build.

### Environment variables

- `VITE_WS_URL` — WebSocket endpoint for online play. Example: `wss://bid-othello-ws.onrender.com` (prod) / `ws://localhost:8787` (local).
- `VITE_ONLINE_ENABLED` — `true` / `false`. When `false`, the online tab is hidden. Useful while the WS server is not yet deployed.

## Deployment

本番は **2 サービス構成**:

- **Web (静的 SPA)** — Vercel
- **WebSocket サーバ** — Render (Free プラン)

### Web (Vercel)

1. [vercel.com/new](https://vercel.com/new) で `inferunity470-hash/othello` を import
2. **Branch** を `offline-launch` に切替
3. Framework は自動検出 (Vite)
4. **Deploy**

ビルド成功後、`https://<project>.vercel.app/` で公開されます。
環境変数の設定は不要です（オンライン対戦を有効化する場合は `VITE_WS_URL` と `VITE_ONLINE_ENABLED` を設定）。

### WebSocket サーバ (Render Free)

リポジトリルートに [`render.yaml`](render.yaml) を同梱しているため、Blueprint
として自動検出される。

1. [render.com/dashboard](https://dashboard.render.com/) → **New +** → **Blueprint**
2. リポジトリ `inferunity470-hash/othello` を選択
3. `render.yaml` が検出され、`bid-othello-ws` Web Service として
   Free プランで作成される (Singapore region, Node 20)
4. デプロイ完了後、`https://bid-othello-ws.onrender.com/health` が
   `{"ok":true}` を返すことを確認
5. Render Dashboard の **Environment** で `ALLOWED_ORIGINS` を
   Vercel の公開 URL (例: `https://bid-othello.vercel.app`) に設定
6. Vercel 側の **Environment Variables** に
   `VITE_WS_URL=wss://bid-othello-ws.onrender.com` を追加し、再デプロイ

#### Render Free の制約

- **15 分アイドルで自動スリープ** — 久しぶりの接続は 30〜60 秒のコールド
  スタートが発生する。オンラインロビーには「サーバ起動中...」表示で
  ユーザーを待たせる UX を入れている
- 750 時間/月の無料枠 (常時稼働でも 1 サービスなら収まる)
- クレジットカード登録不要

### 移行候補: Fly.io

将来的に sleep を回避したい場合に備え、[`fly.toml`](fly.toml) と
[`Dockerfile`](Dockerfile) も同梱している (現状は未使用)。`flyctl launch`
で WS サーバを Fly.io に移行可能。

## Project structure

```
othello/
├── src/                # React + game core
│   ├── core/           # rules, bidding, AI (α-β, PVS, endgame solver)
│   ├── components/     # board, hotseat overlay, online lobby, etc.
│   └── i18n/           # ja / en
├── server/             # WebSocket server (ws + rooms)
├── tests/              # vitest unit / integration
├── e2e/                # Playwright
├── tools/              # AI self-play, A/B harnesses, telemetry
├── docs/               # RULES.md, AI.md
├── public/             # PWA manifest, icons, privacy.html
├── render.yaml         # Render Blueprint (WS server)
├── vercel.json         # Vercel config (web)
├── fly.toml            # Fly.io migration candidate
└── Dockerfile          # for Fly.io / generic container hosts
```

## Documentation

- [docs/RULES.md](docs/RULES.md) — full rules (bidding, token transfer, tie-breaks)
- [docs/AI.md](docs/AI.md) — AI design notes
- [PRIVACY.md](PRIVACY.md) — privacy policy
- [TERMS.md](TERMS.md) — terms of use
- [CONTRIBUTING.md](CONTRIBUTING.md) — contribution guide

## Contributing

Issues and pull requests are welcome. This is a personal project, so response times vary, but feedback on rules balance, AI strength, or UX is especially appreciated. Please see [CONTRIBUTING.md](CONTRIBUTING.md) before opening a PR.

## License

[MIT](LICENSE) © 2025 inferunity470-hash

## Acknowledgements

- Inspired by the literature on **bidding chess** (Richman games / all-pay auction variants) and abstract strategy auction games.
- Built on top of the classic Othello / Reversi ruleset; this project does not affiliate with or claim trademark on "Othello".
- Thanks to the React, Vite, and `ws` ecosystems.
