# AI 設計ドキュメント

## 概要

4 段階の難度を実装している。

| Level | アルゴリズム | 思考時間 |
|---|---|---|
| 😊 初級 (`beginner`) | ランダム合法手 | <10ms |
| 🙂 中級 (`intermediate`) | depth-2 alpha-beta | <100ms |
| 😎 上級 (`advanced`) | depth-4 alpha-beta + 順序付け | ~500ms |
| 😈 鬼 (`oni`) | iterative deepening + PVS + TT + LMR + endgame solver | 1-3 秒 (時間予算) |

## 鬼の探索

### 主要ファイル

- `src/core/ai/index.ts` — `decideBid()` / `decideMove()` のエントリポイント
- `src/core/ai/search.ts` — PVS 探索 (鬼専用)
- `src/core/ai/eval.ts` — 評価関数 + 軽量 alphabeta (中級・上級用)
- `src/core/ai/tt.ts` — トランスポジションテーブル (1M エントリ)
- `src/core/ai/zobrist.ts` — Zobrist ハッシュ

### 探索アルゴリズム

1. **Iterative Deepening**: depth 1 から `maxDepth` まで段階的に深化
2. **Aspiration Window**: 前イテレーションのスコア ± 35-60 の窓で開始、外れたら指数的に拡大
3. **PVS (Principal Variation Search)**: PV 以外の手を null-window で探索
4. **LMR (Late Move Reduction)**: depth ≥ 4 の非 PV 手を 1 ply 削減
5. **TT in Endgame Solver**: 完全終局解 (≤16 empties) で TT を活用
6. **Time Budget**: 各 move に 1-3 秒の上限。timeout 時は前イテレーション結果を保持

### 評価関数

`evaluateBoard(board, color)` は以下の重み付き合計:

| 要素 | 関数 | 重み (opening / midgame / endgame) |
|---|---|---|
| 位置価値 | `positionalScore` | 1.0 / 1.0 / 0.4 |
| 移動可能性 | `mobilityScore` | 6 / 5 / 1 |
| 角支配 | `cornerControl` | 14 / 16 / 10 |
| フロンティア | `frontierScore` | 2 / 2.5 / 0 |
| 安定石 | `stableDiscScore` | 4 / 8 / 12 |
| 潜在的モビリティ | `potentialMobilityScore` | 3 / 2.5 / 0.5 |
| 石数差 | `stoneDifference` | 0 / 0.5 / 6 |
| パリティ | `parityScore` (≤14 empties) | 0 / 0 / 8 |

不変条件: `evaluateBoard(b, BLACK) === -evaluateBoard(b, WHITE)` (negamax 規約)

## 入札戦略

### 共通: 価値推定

`deltaValueOfMoving()` で「自分が今手を打った場合 vs 相手が今手を打った場合」の評価差を算出。これが「入札する価値」。

### 競売方式別の戦略

| 方式 | 戦略 |
|---|---|
| ファースト | 推定価値を `evalPointsToChips()` で chip 換算し、shade 0.6 倍で入札 (rationing) |
| セカンド | shade 0.92 倍 (truthful に近い、Vickrey の弱支配戦略) |
| オールペイ | `allPayBid()` ヘルパで「相手の予想 max bid + 2 → 安価勝利」と「shade × valueChips → コミット」の min を取る (合理的な部分均衡) |

### 階層防御 (`tieredDefenseBid`)

クリティカル局面では shade ベースの入札を上書き:

| Tier | 条件 | 動作 |
|---|---|---|
| Mate | abs(delta) ≥ 5000 or oppBest < -3000 | min(oppMaxModel + 2, cap) |
| Severe | abs(delta) ≥ 1500 or oppBest < -1200 | 0.55-0.62 × chips, 上限 oppMaxModel |
| Moderate | abs(delta) ≥ 350 or oppBest < -250 | 0.32-0.36 × chips, 上限 oppMaxModel |

### 相手モデリング

`estimateOppMaxBid()` で過去 10 ターンの相手入札履歴から「相手が次に張る最大入札」を推定。
- max(過去max × 2, avg × 4, 25% of stack)
- 「初手 50、次ターン all-in」のような escalation 攻撃にも対応

## エクスプロイト対策

過去ユーザーから報告のあった攻撃パターンに対するテスト:
- `tools/exploitTest.ts`: 50/all-in 攻撃 → AI 完勝 (8-0)
- `tools/multiExploitTest.ts`: 12 戦略 (all-in 各ターン、20/40/60/80, tit-for-tat 等) → AI 全勝

## ベンチマーク

```bash
npx tsx tools/tournament.ts 6   # 6 games per pairing, 全難度総当たり
```

直近の結果 (chips=200, 6 games):
- oni vs advanced: 5-1 (83%)
- oni vs intermediate: 5-1 (83%)
- intermediate vs beginner: 5-1 (83%)

## 改良の余地

- Bitboard 化 (現状 `(Color | null)[][]`)
- Pattern-based eval (Edax 風の局所パターン認識)
- Opening book
- Self-play 学習 (NN ベース)

詳細はコード内 JSDoc を参照。
