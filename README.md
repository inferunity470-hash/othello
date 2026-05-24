# Bid Othello — ビッド式オセロ

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

通常のオセロをベースに、各手番の着手権を **両者が秘密入札 (ビッド) で取り合う**
変則ルール。**ホットシート (同機 2 人プレイ)** と **オンライン対戦 (友達とルーム
コードで合流)** を中心に、NPC 練習モードも 4 段階搭載。

English title: **Bid Othello**.

## 起動方法

### 必要環境

- Node.js >= 20
- npm >= 10

### ローカルで遊ぶ (NPC・ホットシートのみ)

```bash
git clone https://github.com/inferunity470-hash/othello.git
cd othello
npm install
npm run dev          # http://localhost:5173
```

### オンライン対戦も含めてローカルで動かす

WebSocket サーバ (`server/index.ts`, ポート 8787) と web を同時に起動します。

```bash
npm install
npm run start        # web (5173) + ws (8787) を concurrently で同時起動
```

別タブ / 別ブラウザで `http://localhost:5173` を開き、「オンライン対戦」タブから
ルーム作成 → 相手側でルームコード入力で参加できます。

### 本番ビルド

```bash
npm run build
npm run preview      # http://localhost:4173
```

`dist/` を Vercel / Cloudflare Pages / GitHub Pages 等にデプロイ可能。
サーバ不要のため、`vercel.json` だけで完結します。

### Vercel にデプロイ

1. [vercel.com/new](https://vercel.com/new) で `inferunity470-hash/othello` を import
2. **Branch** を `offline-launch` に切替
3. Framework は自動検出 (Vite)
4. **Deploy**

ビルド成功後、`https://<project>.vercel.app/` で公開されます。
環境変数の設定は不要です。

## 機能

- **🪑 ホットシート対戦** — 同じ画面を 2 人で交代しながら遊ぶ。入札中は
  `HandoffOverlay` で相手に画面を見せない設計
- **🌐 オンライン対戦** — WebSocket ベースの軽量サーバ。6 桁ルームコードで
  友達と合流、再接続/再戦/観戦に対応。チャットは定型文プリセット (UGC なし)
- **🤖 NPC 練習** (4 段階の難度)
  - 😊 初級 — ランダム合法手
  - 🙂 中級 — 浅い α-β 探索
  - 😎 上級 — 深さ 4 α-β + 順序付け
  - 😈 鬼 — 反復深化 PVS + 終盤完全解析 (1-3 秒思考)
- **3 種類の競売方式**
  - 🪙 ファースト (落札者のみ支払い)
  - 🎲 セカンド (Vickrey)
  - 💸 オールペイ (敗者も入札分を失う) ← デフォルト
- **PWA 対応** — ホームスクリーンに追加してオフライン起動可
- **アクセシビリティ** — 色覚配慮モード、動き軽減、キーボード操作
- **国際化** — 日本語 / 英語

## 環境変数

- `VITE_WS_URL` — オンライン対戦の WebSocket エンドポイント。
  例: 本番 `wss://bid-othello-ws.fly.dev`、ローカル `ws://localhost:8787`。
- `VITE_ONLINE_ENABLED` — `true` / `false`。`true` の時のみオンラインタブを
  表示。未設定時は開発ビルドで自動 on。WebSocket サーバが未デプロイの間は
  本番で `false` を設定して非表示にできる。

## ルール詳細

[docs/RULES.md](docs/RULES.md) を参照。

## AI 設計

[docs/AI.md](docs/AI.md) を参照。

## 関連ドキュメント

- [LICENSE](LICENSE) — MIT
- [PRIVACY.md](PRIVACY.md) — プライバシーポリシー
- [TERMS.md](TERMS.md) — 利用規約
- [CONTRIBUTING.md](CONTRIBUTING.md) — 開発参加ガイド

## ライセンス

MIT License — 詳細は [LICENSE](LICENSE) を参照。
