# ビッド式オセロ — オフライン版 (NPC 対戦のみ)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

通常のオセロをベースに、各手番の着手権を **両者が秘密入札 (ビッド) で取り合う**
変則ルール。本ブランチは **NPC 対戦専用の軽量版** です。サーバ不要で
静的ホスティングだけで動作します。

> オンライン対戦・ホットシート (同機 2 人プレイ) を含むフル版は
> `claude/add-game-launch-guide-DPtLL` ブランチを参照。

## 起動方法

### 必要環境

- Node.js >= 20
- npm >= 10

### ローカルで遊ぶ

```bash
git clone https://github.com/inferunity470-hash/othello.git
cd othello
git checkout offline-launch
npm install
npm run dev          # http://localhost:5173
```

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

- **🤖 NPC 対戦のみ** (4 段階の難度)
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

## ルール詳細

[docs/RULES.md](docs/RULES.md) を参照。

## AI 設計

[docs/AI.md](docs/AI.md) を参照。

## 関連ドキュメント

- [LICENSE](LICENSE) — MIT
- [PRIVACY.md](PRIVACY.md) — プライバシーポリシー (オフライン版なのでサーバ送信なし)
- [TERMS.md](TERMS.md) — 利用規約
- [CONTRIBUTING.md](CONTRIBUTING.md) — 開発参加ガイド

## ライセンス

MIT License — 詳細は [LICENSE](LICENSE) を参照。
