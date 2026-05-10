# ビッド式オセロ (Othello with Bidding)

[![CI](https://github.com/inferunity470-hash/othello/actions/workflows/ci.yml/badge.svg)](https://github.com/inferunity470-hash/othello/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

通常のオセロをベースに、各手番の着手権を **両者が秘密入札 (ビッド) で取り合う** ゲーム。
チップは支払うたびに場へ消えるため、ゲーム進行とともに資源が漸減します。

3 種類の競売方式 (ファースト / セカンド / **オールペイ** ←デフォルト) と、
4 段階の AI 難度 (初級 / 中級 / 上級 / **鬼**) を実装。フレンドとオンライン
対戦も可能 (WebSocket サーバ + 再戦機能 + 自動再 JOIN)。

ルール詳細: [docs/RULES.md](docs/RULES.md)
AI 設計: [docs/AI.md](docs/AI.md)

## 起動方法

### 必要環境

- Node.js >= 20 (本リポジトリは v22 で動作確認)
- npm >= 10

### セットアップ

```bash
npm install
```

### モード別の起動

**1. 同機ホットシート / NPC 対戦のみ (オフライン)**

```bash
npm run dev
```

表示された URL (`http://localhost:5173/`) をブラウザで開き、ロビーから「同機ホットシート」または「NPC 対戦」を選択。

**2. オンライン対戦も含む (フロント + WebSocket サーバ同時起動)**

```bash
npm start
```

これで Vite (`:5173`) と WebSocket サーバ (`:8787`) が同時に起動します。
`localhost:5173` を開き、ロビーで「友達とオンライン」→ ルームを作成 → 6文字のコードを友人に共有。

別の PC やスマートフォンから参加する場合は、サーバ URL を `ws://<あなたのIP>:8787` に変更してください。
LAN を超える場合は ngrok / Cloudflare Tunnel などを噛ませてください。

**3. 本番ビルド (静的ホスティング向け)**

```bash
npm run build
npm run preview   # http://localhost:4173 で確認
```

`dist/` を Vercel / Cloudflare Pages 等にデプロイ可能。
オンライン対戦を使う場合は `server/index.ts` を別途デプロイ ((tsx で起動 or `tsc --outDir dist-server` 後 node 実行)。

**4. Vercel にデプロイ**

このリポジトリは Vercel 用に `vercel.json` を同梱しているのでそのまま import して deploy できる:

1. [vercel.com/new](https://vercel.com/new) で GitHub リポジトリを import
2. Framework は自動検出 (Vite) — そのまま「Deploy」
3. ビルドが終わると `https://<project>.vercel.app/` で公開

ホットシート対戦 / NPC 対戦は静的ホストだけで動作する。
**オンライン対戦のみ** WebSocket サーバ (`server/index.ts`) を別途
立てる必要がある (Render / Fly.io / Railway 等):

```bash
# Render の場合: Web Service を作成、Build = npm install,
# Start = npm run server, Port = 8787 を expose
# 取得した wss URL を Vercel のプロジェクト環境変数に設定:
VITE_WS_URL=wss://your-othello-server.onrender.com
```

`VITE_WS_URL` を設定後に Vercel 側で再デプロイすると、Online タブ
の入力欄にデフォルトでその URL が入る。未設定でも Online タブは
動作するが、別途自前のサーバ URL をフォームに入れる必要がある旨
の注意書きが表示される。

### テスト・型チェック

```bash
npm test                # Vitest を一回実行
npx tsc --noEmit        # 型チェック
```

## 機能ハイライト

- **NPC 4 段階**: 初級 / 中級 / 上級 / **鬼**(エンドゲーム完全解析・深さ 6〜10 の α-β、人間が勝つのは至難)
- **オンライン対戦**: 6 文字のルームコード、観戦モード、入札の秘匿はサーバ側で物理的に保証
- **イベントソーシング**: `TurnRecord[]` がゲームの正本。リプレイ・デバッグ・同期に活用
- **コーナーボーナス・ゼロ入札制限**: 仕様書の全オプション実装済み (デフォルト: corner +10, ストリーク無制限)
- **アクセシビリティ**: 黒石/白石を文字でも区別、`aria-label` で読み上げ対応

## ディレクトリ構造

```
src/
  core/         ゲームロジック (DOM・React 非依存)
    types.ts
    board.ts
    bidding.ts
    gameLoop.ts
    events.ts
    scoring.ts
    ai/
      eval.ts
      index.ts
  net/          通信層 (フェーズ2)
    protocol.ts
    partyClient.ts
  ui/           React コンポーネント
    App.tsx
    Board.tsx
    BidPanel.tsx
    HUD.tsx
    GameLog.tsx
    HandoffOverlay.tsx
    OnlineLobby.tsx
    styles.css
server/         WebSocket サーバ (オンライン対戦用)
  index.ts
tests/          Vitest テスト
```

## 環境変数 (本番デプロイ時)

| 変数 | 用途 | 設定先 |
|---|---|---|
| `VITE_WS_URL` | WS サーバの URL (`wss://...`) | Vercel |
| `VITE_ERROR_WEBHOOK_URL` | フロント側エラー報告先 (任意) | Vercel |
| `VITE_APP_VERSION` | エラーレポートに付与するバージョン (任意) | Vercel |
| `PORT` | WS サーバの待ち受けポート | Render (自動設定される) |
| `ALLOWED_ORIGINS` | カンマ区切りの許可オリジン (例 `https://my-app.vercel.app`)。未設定時は全許可 (開発向け) | Render |

## セキュリティ

- WS サーバは `ALLOWED_ORIGINS` で接続元を制限可能
- 1 接続あたり 30 msg/sec の rate limit
- メッセージサイズ上限 4KB
- 入札の秘匿はサーバ側で物理的に保証

## 関連ドキュメント

- [LICENSE](LICENSE) — MIT
- [PRIVACY.md](PRIVACY.md) — プライバシーポリシー
- [TERMS.md](TERMS.md) — 利用規約
- [CONTRIBUTING.md](CONTRIBUTING.md) — 開発参加ガイド
- [docs/RULES.md](docs/RULES.md) — ルール仕様書
- [docs/AI.md](docs/AI.md) — AI 設計

## ライセンス

MIT License — 詳細は [LICENSE](LICENSE) を参照。
