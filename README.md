# ビッド式オセロ (Othello with Bidding)

通常のオセロをベースに、各手番の着手権を **両者が秘密入札 (ビッド) で取り合う** ゲーム。
チップは支払うたびに場へ消えるため、ゲーム進行とともに資源が漸減します。
詳細仕様は要望書 v2 (本リポジトリで実装済み) を参照。

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

## ライセンス
本コードは `inferunity470-hash/othello` リポジトリの一部として配布。

