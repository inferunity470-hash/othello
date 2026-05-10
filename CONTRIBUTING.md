# Contributing

ご協力ありがとうございます。

## ローカル開発のセットアップ

```bash
git clone https://github.com/inferunity470-hash/othello.git
cd othello
npm install
npm run dev          # http://localhost:5173
npm run server       # ws://localhost:8787 (オンライン対戦用)
```

## 推奨開発フロー

1. `main` から feature ブランチを切る (`feat/<short-description>` or `fix/<short>`)
2. 変更を加える前に `npm test` がパスすることを確認
3. 変更後、以下が全て通ること:
   - `npm run typecheck`
   - `npm run lint`
   - `npm test`
   - `npm run build`
4. PR を `main` へ向けて作成

## コーディング規約

- **TypeScript strict** モードで書く
- ESLint / Prettier の警告はゼロを保つ
- コミットメッセージは `<type>(<scope>): <description>` 形式 (例: `feat(ai): improve oni's all-pay strategy`)
- コア (`src/core`) は React・DOM 非依存に保つ
- UI 改修は `tests/uiSmoke.test.tsx` 等のスモークテストに対応する変更を含める

## テスト

- ユニットテスト: `tests/*.test.ts(x)` (Vitest)
- E2E テスト: `e2e/*.spec.ts` (Playwright)
- カバレッジ: 全体で 90% 以上を目標

## ファイル構成

```
src/
  core/           ゲームロジック (DOM・React 非依存)
    types.ts
    board.ts
    bidding.ts
    gameLoop.ts
    events.ts
    scoring.ts
    serialize.ts
    ai/
      eval.ts
      search.ts
      tt.ts
      zobrist.ts
      index.ts
  net/            通信層
    protocol.ts
    partyClient.ts
  ui/             React コンポーネント
    App.tsx
    Board.tsx
    BidPanel.tsx
    HUD.tsx
    OnlineLobby.tsx
    ...
  i18n/           翻訳
server/           WebSocket サーバ
tools/            開発ツール (tournament, exploit テスト)
tests/            Vitest テスト
e2e/              Playwright テスト
docs/             仕様書 / 設計ドキュメント
```

## バグ報告

GitHub Issues に以下を含めてご報告ください:
- 再現手順
- 期待動作 / 実際の動作
- ブラウザ・OS・画面サイズ
- 可能であればスクリーンショット or コンソールエラー

## 行動規範

- 建設的で礼儀正しいコミュニケーションを心がけてください
- 政治・宗教・差別等に関する議論はリポジトリの目的から外れるためご遠慮ください
