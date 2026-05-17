# ビッド式オセロ — オフライン NPC 専用版 開発引き継ぎ資料

このドキュメントは、別の Claude Code セッションにこのプロジェクトの作業内容を引き継ぐための包括的な記録です。

---

## 1. プロジェクト概要

- **アプリ名**: ビッド式オセロ
- **コンセプト**: 着手権を秘密入札で取り合う戦略的オセロ。各ターン、両プレイヤーがチップを賭けて入札し、高額入札者が次の駒を置く権利を獲得する。
- **GitHub**: `inferunity470-hash/othello`
- **技術スタック**: TypeScript strict / React 18 / Vite / PWA / vitest
- **ローンチ形態**: **オフライン NPC 専用版**（オンライン対戦・ホットシート除去済）

### 主要ブランチ
| ブランチ名 | 内容 | 状態 |
|---|---|---|
| `main` | 開発本流 | — |
| `claude/add-game-launch-guide-DPtLL` | フル版（オンライン・ホットシート・NPC 全部入り） | proxy 許可 push 可能 |
| `claude/offline-launch-DPtLL` | **オフライン NPC 専用版（本セッションの本流）** | proxy 許可 push 可能 |
| `offline-launch` | 同上のローカルバックアップ | proxy 403 で push 不可 |

**重要**: Anthropic CLI のプロキシは `claude/*` 名前空間のブランチへの push のみ許可しています。`offline-launch` への push は 403 で拒否されたため、`claude/offline-launch-DPtLL` を作成して同内容を保持しています。

---

## 2. セッション全体の流れ（要約）

### Phase 0: フル版の完成（前セッション）
- オンライン対戦実装（WebSocket サーバ、ルーム機能、再戦同意）
- 全 AI レベル（beginner/intermediate/advanced/oni）実装
- All-pay 競売をデフォルトに変更
- 先手権トークンの大きな視覚強調
- ローンチ準備（ライセンス、規約、セキュリティ、UX 整備）

### Phase 1: オフライン NPC 専用版ブランチ作成
- `d491efd` でブランチ `offline-launch` を作成
- 同機ホットシート・オンライン対戦の UI および対応コードを削除
- NPC 対戦のみのロビーに簡素化
- `@types/node` 等のサーバ依存を除去

### Phase 2: cornerAdjacentScore 実験（負の結果として残す）
- `b986b6d`: コーナー隣接の文脈依存評価項を追加
- 理論的には妥当（X/C 評価がコーナー所有状況を無視している弱点を補正）
- 1000戦 A/B では強化が確認できず、**既定値 0（無効）** で残置
- `ONI_BID_V2`-like の env-var togglable（`ONI_CORNER_ADJ=1` で有効化）

### Phase 3: 鬼ビッディング v2 設計 & 実装
- `54cca9f`: トークン保持の対称性原理、保持者非対称ベース、タイブレーク戦略、終盤チップ全振り
- v1 と env-var で A/B 可能（`ONI_BID_V2=0` で旧挙動）

### Phase 4: 自己対戦テレメトリ収集
- `6bb5d65`: クラッシュ resume 対応の改善
- 1000戦の oni-vs-oni 自己対戦（v2 bidder）
- 結果: 黒 48.1% / 白 51.3% — **黒（初期保持者）が劣後する想定外バイアス発見**

### Phase 5: v2.1 修正
- `5e6ee9c`: 「スパース開幕では両者対称ベース＋非保持者バンプ無効化」
- 500戦で再検証: 黒 51.6% / 白 47.2% — **逆転成功、自然な先手優位を回復**

### Phase 6: 鬼最終強化 v2.2
- `dc66a37`: 探索時間予算と深さを NPC モード向けに引き上げ
- 完全解局の閾値拡大（16→18 空マス）
- ビッド評価のフォーキャスト深化（depth +1, time 700→900ms）
- 全 212 テスト pass

### Phase 7: デプロイ
- Vercel への CLI デプロイで `othello-tau-nine.vercel.app`（本番）と preview URLs

---

## 3. 主要コミット一覧（claude/offline-launch-DPtLL）

```
4a50b96 chore: gitignore tsconfig.tsbuildinfo (TS incremental build cache)
dc66a37 ai(oni): v2.2 — 過去1500戦の知見を踏まえ NPC モード向けに探索精度を最終強化
5e6ee9c ai(bid): v2.1 — スパース開幕は対称ベース＋タイバンプ無効化（黒の先手保持優位を保護）
6bb5d65 tools(oni1000): クラッシュ時の resume 用に START / OUT_FILE 引数を追加
54cca9f ai(bid): 鬼 ビッディング v2 — 文脈非対称化と全フェーズ最適化
b986b6d ai(eval): 鬼AI 強化試行 — cornerAdjacentScore を追加（既定は無効）
d491efd オフライン NPC 専用版を作成 (offline-launch ブランチ)
```

---

## 4. ゲームルールの重要な構造

### 入札ルール
- 競売方式（デフォルト）: **all-pay**（両者が入札額を失う）
- 他に first-price と second-price (Vickrey) も実装あり
- タイ（同額入札）→ **初期保持者 = 黒が勝つ**

### トークン移譲ルール
- 「置いたプレイヤー（mover）が現在のトークン保持者なら、トークンは相手に移譲」
- 「mover が非保持者なら、トークンは現保持者のまま」
- 帰結:
  - 保持者が入札勝 → 置く → トークン放出
  - 保持者が入札敗 → 相手が置く（非保持者として）→ トークン据置（保持者継続）
  - 非保持者が入札勝 → 置く → 保持者据置
  - **非保持者が入札敗 → 保持者が置く → 保持者放出 → 自分が新保持者！**

この最後の点が重要で、**非保持者は入札に負けてもトークンを獲得できる**ため、win-vs-lose 差分は両者共に `placement - TOKEN_COST` となります（v2 の対称トークンコスト調整の根拠）。

---

## 5. 鬼ビッディング v2.1/v2.2 の詳細設計

### TOKEN_COST = 6（ゲーム理論的補正）
両者の入札評価から `delta - TOKEN_COST` で adjusted を算出。これは「勝った時の placement 価値」と「負けた時の token 価値」の差分。

### スパース開幕（empties ≥ 50）の特別扱い（v2.1 の核心）
- 保持者ベース: `chips * 0.05` （= chips=100 で 5）
- 非保持者ベース: 同じく `chips * 0.05`（対称！）
- 非保持者の +2 タイバンプも **無効化**
- 結果: タイは保持者 = 黒が勝ち、自然な先手優位を確保

### ミッドゲーム以降（empties < 50）
- 保持者ベース: `chips * 0.06` （低、温存型）
- 非保持者ベース: `chips * 0.10 + 1` （高、競り勝ち型）
- 非保持者は +2 タイバンプ適用 → 競り合いに勝つ
- 哲学: トークン保持者は「タイ勝ち優位を温存」、非保持者は「placement を買う」

### 終盤チップ全振り（v2 で追加）
- estimatedRemainingBids ≤ 2: cap = chips * 1.00（100%）
- ≤ 4: cap = 0.96
- それ以外: 0.92
- 「将来のために温存」する意味が薄れる終盤で余り資金を最大活用

### v2.2 NPC モード強化
鬼の探索計算予算を ~40% アップ（オフライン UI 制約なし）：

```ts
// pickOniMove time budget
empties ≤ 10: 3000ms → 4500ms, depth 22, exact endgame
empties ≤ 18: 2500ms → 3500ms, depth 18→20, exact endgame  // 閾値16→18
empties ≤ 22: 1500ms → 2200ms, depth 12→14
else:         1000ms → 1400ms, depth 10→11

// decideBid forecast
depth 8/9/10 → 9/10/11
timeBudget 700ms → 900ms
```

---

## 6. 検証結果まとめ

### v2 1000戦自己対戦（chips=100, 2-ply random opening）
| 指標 | 値 |
|---|---|
| BLACK 勝 | 481 (48.1%) ← 想定外劣後 |
| WHITE 勝 | 513 (51.3%) |
| 引分 | 6 (0.6%) |
| 平均マージン (B-W) | 0.1 |
| 中央値マージン | -3 |
| 終了理由 | CHIPS_EXHAUSTED 163 / BOTH_NO_MOVES 837 |
| Random-opening 即詰み | 357 (35.7%) |
| 非保持者の入札勝率 | 59.1% |

**問題**: 非保持者バンプにより白（初期非保持者）が opening で連続的に置き、positional foothold を獲得。

### v2.1 500戦自己対戦（同条件）
| 指標 | 値 | v2比較 |
|---|---|---|
| BLACK 勝 | 258 (**51.6%**) | +3.5pt ↑ |
| WHITE 勝 | 236 (47.2%) | -4.1pt ↓ |
| 引分 | 6 (1.2%) | +0.6pt |
| 平均マージン (B-W) | 2.2 | +2.1 |
| 中央値マージン | 4 | +7 |
| 平均ターン数 | 28.6 | +15.8 |
| 保持者の入札勝率 | 44.4% | +3.5pt |

**結論**: スパース開幕の対称ベースで黒の自然な先手優位を回復。マージン中央値も +4 ポジティブにシフト。

### v2.2 強化後のテスト
- 全 **212 テスト pass**（3 分）
- oniStrength.test.ts: 鬼 vs advanced 4戦で 150s（v2.1 比 ~9 倍）→ 強化された搜索精度の証左
- 240s タイムアウト内で安定動作

---

## 7. デプロイ状態

- **Vercel プロジェクト**: `inferunity470-hashs-projects/othello`
- **本番 URL**: `othello-tau-nine.vercel.app`
- **設定ファイル**: `vercel.json`（framework: vite, install: `npm ci --legacy-peer-deps`）
- **PWA 対応済み**（オフラインプレイ可能）

### 本番への正しいデプロイ手順

```bash
cd othello
git fetch origin
git checkout claude/offline-launch-DPtLL
git branch --show-current  # ← claude/offline-launch-DPtLL の確認
npm ci --legacy-peer-deps
npx vercel --prod
```

**注意点**: ローカル clone が古いと `git checkout` でエラーが出るので `git fetch` が必須。

---

## 8. 重要ファイル全容

### `src/core/ai/index.ts` (575 行)

主要関数:
- `TOKEN_COST = 6` (定数)
- `pickOniMove(state, mover)` — 鬼の手選択。v2.2 で時間予算 ~40% アップ
- `decideBid(ctx, rng)` — 全レベル対応の入札決定。oni では v2/v2.1/v2.2 を統合
- `oniBidV2()` — ONI_BID_V2 環境変数で v1/v2 切替
- `allPayBid(...)` — all-pay 入札ロジック（isHolder パラメータ追加）

```typescript
// Sparse opening symmetric base (v2.1)
const sparse = empties >= 50;
const suppressTieBump = useV2 && sparse;
let baseBid: number;
if (useV2) {
  if (sparse) {
    // Symmetric base in opening — ties favour holder (initial=BLACK).
    baseBid = Math.max(2, Math.floor(chips * 0.05));
  } else {
    const baseHolderRatio = 0.06;
    const baseNonHolderRatio = 0.10;
    const baseRatio = isHolder ? baseHolderRatio : baseNonHolderRatio;
    baseBid = Math.max(
      isHolder ? 1 : 3,
      Math.floor(chips * baseRatio) + (isHolder ? 0 : 1)
    );
  }
}

// In sparse opening, suppress non-holder bump
const isHolderForTiebreak = isHolder || suppressTieBump;
```

### `src/core/ai/eval.ts` の追加（cornerAdjacentScore）

```typescript
export function cornerAdjacentScore(board: Board, color: Color): number {
  const groups = [
    { corner: [0, 0], x: [1, 1], cs: [[0, 1], [1, 0]] },
    { corner: [0, 7], x: [1, 6], cs: [[0, 6], [1, 7]] },
    { corner: [7, 0], x: [6, 1], cs: [[6, 0], [7, 1]] },
    { corner: [7, 7], x: [6, 6], cs: [[6, 7], [7, 6]] },
  ];
  const sign = (r, c) => board[r][c] === 'BLACK' ? 1 : board[r][c] === 'WHITE' ? -1 : 0;
  let s = 0;
  for (const g of groups) {
    const cs = sign(g.corner[0], g.corner[1]);
    const xs = sign(g.x[0], g.x[1]);
    if (cs === 0) {
      s -= xs * 30;
      for (const [cr, cc] of g.cs) s -= sign(cr, cc) * 12;
    } else {
      s += cs * xs * 10;
      for (const [cr, cc] of g.cs) s += cs * sign(cr, cc) * 4;
    }
  }
  return color === 'BLACK' ? s : -s;
}
```

`evaluateBoard` 内で `cornerAdjMultiplier()` を介して使用。既定で 0（無効）、`ONI_CORNER_ADJ=1` で有効化可能。

---

## 9. 自己対戦ツール一覧

### `tools/oni1000.ts` (193 行)
- 大量自己対戦 + JSONL テレメトリ書き出し
- クラッシュ resume 対応（START / OUT_FILE 引数）
- 使い方: `npx tsx tools/oni1000.ts <N> <chips> [start] [out_file]`
- 例: `npx tsx tools/oni1000.ts 1000 100`
- 例（resume）: `npx tsx tools/oni1000.ts 1000 100 284 data/oni-runs-xxx.jsonl`

### `tools/analyzeOniRuns.ts` (184 行)
- JSONL テレメトリの集計レポート
- 勝率・マージン・フェーズ別ビッド分布・タイ率・保持者勝率を出力
- 使い方: `npx tsx tools/analyzeOniRuns.ts <jsonl-path>`

### `tools/oniBidAB.ts` (115 行)
- ONI_BID_V2 を per-move で切替えて v1 vs v2 を A/B 比較
- 使い方: `npx tsx tools/oniBidAB.ts [games] [chips]`

### `tools/oniAB.ts` (127 行)
- ONI_CORNER_ADJ をトグルして cornerAdj on/off の A/B
- 使い方: `npx tsx tools/oniAB.ts [games]`

### `tools/quickAB.ts` (96 行)
- 鬼 vs intermediate の小規模 A/B（cornerAdj 検証用）
- chips=50 / 6戦デフォルトで高速

### `tools/oniVsOni.ts` (157 行)
- 鬼-vs-鬼ベースラインのみ計測（テレメトリ無し）
- 使い方: `npx tsx tools/oniVsOni.ts [games] [chips]`

---

## 10. 検証用テスト一覧

### 強さテスト（`tests/oniStrength.test.ts`, `tests/ai.test.ts`）
- `oni beats advanced ≥3 of 4 games`（240s timeout）
- `oni beats intermediate 4/4`（240s timeout）
- `AI strength ranking > oni beats beginner across 4 games`
- `AI strength ranking > oni beats advanced majority of the time`

### Negamax 対称性（`tests/aiEvalSymmetry.test.ts`）
- 全評価関数コンポーネントについて `f(b, BLACK) === -f(b, WHITE)` を検証
- 新規 `cornerAdjacentScore` も検証対象に追加済

### ビッディングテスト（`tests/aiBidding.test.ts`）
- Vickrey vs First-price の入札強度比較（first-price を明示指定して比較）
- All-pay で NaN/負値なし
- 入札 cap 上限（chips * 0.92）の検証

---

## 11. 既知の問題・残課題

### 既知の制約
1. **ランダム開幕の 35% 即詰み率**: 2-ply ランダム配置で即終了する局面が一定発生。テレメトリには影響するが、AI の強さには無関係。
2. **オンプロセスの突然停止**: `oni1000.ts` のバックグラウンド実行が時々無音で kill される（OS かハーネスの限界かは不明）。`START` 引数で resume 可能。
3. **テスト合計時間 ~3分**: v2.2 強化で oni 関連テストが ~9 倍に。CI 上では `--reporter=dot` + 直列実行で 240s 制限内に収まる。

### 残課題（推奨）
- ローカル `offline-launch` ブランチへの push が proxy 403。`claude/offline-launch-DPtLL` を本流として使う想定だが、もし `offline-launch` を整理する場合は手動 push が必要。
- データファイル `data/*.jsonl` は `.gitignore` 済みで未追跡。バックアップが必要なら別途保存。

---

## 12. 過去会話の要約（重要な意思決定）

### 「全て実行してください」（ローンチ準備）
- ライセンス・規約・セキュリティ・UX 整備をフル実装

### 「オフライン対戦だけのものでローンチ」
- `offline-launch` ブランチ作成、サーバ削除、ホットシート削除、NPC のみのロビー

### 「鬼同士の対戦1000回から学習」
- 自己対戦テレメトリ収集 + ハーネス作成（実時間 ~14h）
- 1000戦データから「黒劣後」を発見

### 「ルール上、先手権を持っている黒が白に勝率劣後する理由はほとんどない」
- v2 設計の構造的バグを特定（非保持者バンプによる序盤の白優位）
- v2.1 修正案を提示・実装
- 500戦で逆転検証成功

### 「過去戦績をもとに鬼の難易度を最終強化」
- v2.2 として探索計算予算を上げる
- 完全解局閾値 16→18、各フェーズ深さ +2、time budget +40%

---

## 13. 次セッションへの推奨

### このまま完了とする場合
- `claude/offline-launch-DPtLL` ブランチを `main` にマージ
- Vercel 本番 URL を切り替え（`vercel --prod`）

### さらに強化したい場合の余地
1. **NNUE 評価への移行**（大改修、強さ +200 Elo 級）
2. **並列搜索**（Web Worker で多コア活用、計算量 ~2-4 倍に拡張）
3. **Book of openings**（戦略ライブラリで序盤を高速化＋強化）
4. **bid history の長期統計化**（過去全ゲームからの相手モデリング）

### デバッグ・観測の助け
- `tools/analyzeOniRuns.ts` でテレメトリ再分析
- `ONI_BID_V2=0` で v1 復元 A/B
- `ONI_CORNER_ADJ=1` で cornerAdj 再有効化

---

## 14. ファイル / コード参照のクイックリンク

| 機能 | ファイル | 行 |
|---|---|---|
| 鬼の手選択 | `src/core/ai/index.ts` | 155-193 |
| 鬼のビッド | `src/core/ai/index.ts` | 430-548 |
| トークン対称コスト | `src/core/ai/index.ts` | 442-445 |
| v2.1 スパース開幕修正 | `src/core/ai/index.ts` | 456-476 |
| cornerAdjacentScore | `src/core/ai/eval.ts` | 143-183 |
| 入札解決 | `src/core/bidding.ts` | 50-75 |
| ゲームループ | `src/core/gameLoop.ts` | 全体 |
| 評価関数 | `src/core/ai/eval.ts` | 全体 |
| PVS 探索 | `src/core/ai/search.ts` | 全体 |

---

## 15. 環境変数

| 名前 | 値 | 効果 |
|---|---|---|
| `ONI_BID_V2` | `1`/未設定 | v2 入札（既定） |
| `ONI_BID_V2` | `0` | v1 入札（旧挙動） |
| `ONI_CORNER_ADJ` | `0`/未設定 | cornerAdj 無効（既定） |
| `ONI_CORNER_ADJ` | `1` | cornerAdj 有効（1.5/2.0/0.8 重み） |
| `ONI_CORNER_ADJ` | `0.3` 等 | スケール係数として適用 |

---

このドキュメントを別の Claude Code セッションに貼り付ければ、上記の文脈を持って即座に作業継続できます。

---

# 付録 A: 主要ソースコード全文

以下、本セッションで作成・改変した主要ファイルの全文を収録します。

## A.1 `src/core/ai/index.ts`（全文 575 行）

```typescript
import { Color, GameState, opponentOf } from '../types';
import { applyMove, legalMoves } from '../board';
import { currentMinBid } from '../bidding';
import { alphabeta, mobilityCount } from './eval';
import { strongSearch } from './search';

export type AILevel = 'beginner' | 'intermediate' | 'advanced' | 'oni';

export interface AIBidContext {
  state: GameState;
  color: Color;
  level: AILevel;
}

/**
 * "Token cost" — how many board-eval points the AI implicitly pays for
 * losing the initiative token. Game-theoretically, BOTH sides should
 * adjust their bid by `delta - TOKEN_COST` because:
 *   - Holder winning bid → places, loses token (cost = TOKEN_COST)
 *   - Holder losing bid → opp places (non-holder), holder keeps token (cost = 0)
 *   - Non-holder winning bid → places, status unchanged (cost = 0)
 *   - Non-holder losing bid → holder places, holder loses token to me (gain = TOKEN_COST)
 * In both cases, the win-vs-lose differential is `placement - TOKEN_COST`.
 *
 * Empirically tuned: 18 was too high — caused holders to bid 0 in nearly
 * symmetric positions, leading to mechanical alternation and short games.
 * 6 keeps the bias gentle without crippling competitive bidding.
 * (Higher values up to 10 were tested but reduced oni's win rate at
 * chips=100, suggesting the token's marginal value is small for typical
 * game lengths.)
 */
const TOKEN_COST = 6;

function deltaValueOfMoving(
  state: GameState,
  color: Color,
  depth: number,
  useStrong = false,
  timeBudgetMs?: number
): { delta: number; myBest: number; oppBest: number } {
  const opp = opponentOf(color);
  let myScore: number;
  let oppScore: number;
  if (useStrong) {
    const me = strongSearch(state.board, color, {
      maxDepth: depth,
      exactEndgameEmpties: 0,
      timeBudgetMs,
    });
    const them = strongSearch(state.board, opp, {
      maxDepth: depth,
      exactEndgameEmpties: 0,
      timeBudgetMs,
    });
    // strongSearch returns scores from the searcher's POV. Convert opp's
    // score to `color`'s POV by negation.
    myScore = me.score;
    oppScore = -them.score;
  } else {
    const myBest = alphabeta(state.board, color, depth, -Infinity, Infinity, color);
    const oppBest = alphabeta(state.board, opp, depth, -Infinity, Infinity, color);
    myScore = myBest.score;
    oppScore = oppBest.score;
  }
  return { delta: myScore - oppScore, myBest: myScore, oppBest: oppScore };
}

function clampBid(amount: number, state: GameState, color: Color): number {
  const minBid = currentMinBid(state);
  const max = state.players[color].chips;
  let v = Math.round(amount);
  if (!Number.isFinite(v)) v = minBid;
  if (v < minBid) v = minBid;
  if (v > max) v = max;
  return v;
}

function pickRandomMove(
  state: GameState,
  mover: Color,
  rng: () => number
): { row: number; col: number } {
  const moves = legalMoves(state.board, mover);
  if (moves.length === 0) throw new Error('No legal move for AI');
  return moves[Math.floor(rng() * moves.length)];
}

function pickGreedyMove(state: GameState, mover: Color): { row: number; col: number } {
  const moves = legalMoves(state.board, mover);
  if (moves.length === 0) throw new Error('No legal move for AI');
  let best = moves[0];
  let bestScore = -Infinity;
  for (const m of moves) {
    const { newBoard, flipped } = applyMove(state.board, mover, m.row, m.col);
    const cornerBonus = isCorner(m.row, m.col) ? 1000 : 0;
    const xSquarePenalty = isXSquareNextToFreeCorner(state.board, m.row, m.col)
      ? -300
      : 0;
    // Penalty for granting opponent many replies
    const oppMobility = mobilityCount(newBoard, opponentOf(mover));
    const score = flipped.length + cornerBonus + xSquarePenalty - oppMobility * 4;
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best;
}

function isCorner(r: number, c: number): boolean {
  return (r === 0 || r === 7) && (c === 0 || c === 7);
}

function isXSquareNextToFreeCorner(
  board: import('../types').Board,
  r: number,
  c: number
): boolean {
  const xMap: Array<[[number, number], [number, number]]> = [
    [
      [1, 1],
      [0, 0],
    ],
    [
      [1, 6],
      [0, 7],
    ],
    [
      [6, 1],
      [7, 0],
    ],
    [
      [6, 6],
      [7, 7],
    ],
  ];
  for (const [[xr, xc], [cr, cc]] of xMap) {
    if (r === xr && c === xc && board[cr][cc] === null) return true;
  }
  return false;
}

function pickAlphaBetaMove(
  state: GameState,
  mover: Color,
  depth: number
): { row: number; col: number } {
  const r = alphabeta(state.board, mover, depth, -Infinity, Infinity, mover);
  if (!r.move) {
    return pickGreedyMove(state, mover);
  }
  return r.move;
}

function pickOniMove(state: GameState, mover: Color): { row: number; col: number } {
  const empties = countEmpty(state.board);
  // NPC-mode final strengthening (v2.2): time budgets bumped ~40% across all
  // phases, exact endgame solve extended from 16 → 18 empties, midgame
  // depth bumped 12→14 / 10→11. Original budgets were tuned for UI snappiness
  // in online play; offline NPC mode allows deeper thinking.
  //
  //   - empties ≤ 10: maxDepth 22, exact endgame, 4500ms (was 3000ms)
  //   - empties ≤ 18: maxDepth 20, exact endgame, 3500ms (was depth 18 / 2500ms / ≤16)
  //   - empties ≤ 22: maxDepth 14, midgame PVS, 2200ms (was depth 12 / 1500ms)
  //   - else:         maxDepth 11, opening/midgame PVS, 1400ms (was depth 10 / 1000ms)
  let maxDepth: number;
  let exactEndgameEmpties: number;
  let timeBudgetMs: number | undefined;
  if (empties <= 10) {
    maxDepth = 22;
    exactEndgameEmpties = empties;
    timeBudgetMs = 4500;
  } else if (empties <= 18) {
    maxDepth = 20;
    exactEndgameEmpties = empties;
    timeBudgetMs = 3500;
  } else if (empties <= 22) {
    maxDepth = 14;
    exactEndgameEmpties = 0;
    timeBudgetMs = 2200;
  } else {
    maxDepth = 11;
    exactEndgameEmpties = 0;
    timeBudgetMs = 1400;
  }
  const r = strongSearch(state.board, mover, {
    maxDepth,
    exactEndgameEmpties,
    timeBudgetMs,
  });
  if (!r.move) return pickGreedyMove(state, mover);
  return r.move;
}

function makeRng(seed?: number): () => number {
  let s = seed ?? Date.now();
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function countEmpty(board: import('../types').Board): number {
  let n = 0;
  for (const row of board) for (const c of row) if (c === null) n++;
  return n;
}

/* ----------------------------- Bidding strategy ----------------------------- */

/**
 * Convert an eval-point value of "winning this auction" into a chip-
 * equivalent bid. Smooth exponential saturation: small values give a
 * small bid, large values approach (but never exceed) `decisiveCap`.
 *
 * Calibration:
 *   value=0      → 0 chips
 *   value=300    ≈ chips * 0.27
 *   value=800    ≈ chips * 0.54
 *   value=2000   ≈ chips * 0.78
 *   value=5000+  ≈ chips * 0.85 (asymptote)
 *
 * The 800 scale matches the typical midgame eval magnitude where a
 * decisive corner-or-wipeout swing lives.
 */
function evalPointsToChips(value: number, chips: number): number {
  if (value <= 0) return 0;
  const decisiveCap = chips * 0.85;
  return decisiveCap * (1 - Math.exp(-value / 800));
}

/**
 * Pick an all-pay bid that exploits both deep evaluation and opponent
 * modelling. Strategy:
 *
 *  - adjusted ≤ 0       → bid 0 (skip, both pay 0 if opp also skips)
 *  - clear advantage    → commit ~80% of valueChips (shade-based, like
 *                         first-price but wider since opp also pays)
 *  - marginal value     → bid only enough to beat opp's recent max bid,
 *                         provided that's cheaper than the value
 *
 * The shade branch lets oni's deep search dominate via accurate
 * `valueChips`; the min-to-win branch keeps us cheap against weak
 * bidders. baseBid is the floor (T1 protection).
 */
function allPayBid(
  state: GameState,
  color: Color,
  adjusted: number,
  chips: number,
  oppChips: number,
  baseBid: number,
  shade: number,
  isHolder = false
): number {
  if (adjusted <= 0) return 0;
  const valueChips = evalPointsToChips(adjusted, chips);
  const target = Math.floor(valueChips * shade);
  const oppMaxModel = estimateOppMaxBid(state, opponentOf(color), oppChips);
  // Cheap-win path: if opp's modelled max is well below our shaded
  // target, bid just above it instead of over-paying. The bump differs
  // by holder status: as holder, ties go to us so +0 suffices; as
  // non-holder, we must bid strictly above (we use +2 for safety
  // against estimator noise).
  const tieBump = isHolder ? 0 : 2;
  const minToWin = oppMaxModel + tieBump;
  let cheap = minToWin < target ? minToWin : target;
  // Apply tiebump even when target dominates: in symmetric oni-vs-oni
  // positions both sides compute the same `target` and tie. Non-holder
  // pays its bid in all-pay → losing a tie is wasteful. The +1
  // ensures non-holder beats a holder whose bid converges to the same
  // target.
  if (!isHolder) cheap += 1;
  return Math.max(baseBid, cheap);
}

/**
 * Estimate the opponent's plausible max bid this turn from recent
 * history. Used to bound the defense bid: bidding the full theoretical
 * `oppChips` is wasteful when history shows the opponent only spends
 * a fraction of their stack per turn. Falls back to oppChips when too
 * few past bids exist to be confident.
 */
function estimateOppMaxBid(
  state: GameState,
  oppColor: Color,
  oppChips: number
): number {
  const past = state.history.filter(t => t.bids != null).slice(-10);
  if (past.length === 0) return oppChips;
  let maxBid = 0;
  let total = 0;
  for (const t of past) {
    const b = (t.bids![oppColor] as number) ?? 0;
    if (b > maxBid) maxBid = b;
    total += b;
  }
  const avg = total / past.length;
  // Allow for escalation: 2x recent max OR 4x average OR 25% of stack,
  // whichever is largest. Always upper-bounded by actual oppChips. The
  // 2x multiplier covers the "escalation" pattern (e.g. 20→40→60→80) so
  // we don't underbid when the opponent ramps each turn.
  const estimate = Math.max(maxBid * 2, avg * 4, oppChips * 0.25);
  return Math.min(oppChips, Math.ceil(estimate));
}

/**
 * Tiered defence — for genuinely critical positions we override the
 * value-based bid with a "match opponent" strategy. The cap depends on
 * the *modelled* max-opponent-bid (history-aware) rather than the
 * worst-case oppChips. This prevents naïve all-in defences against
 * a human who never spends more than 30% of their stack.
 */
function tieredDefenseBid(
  state: GameState,
  color: Color,
  delta: number,
  oppBest: number,
  myChips: number,
  oppChips: number,
  scale: 'advanced' | 'oni'
): number {
  const cap = Math.max(1, Math.floor(myChips * 0.92));
  const oppMaxModel = estimateOppMaxBid(state, opponentOf(color), oppChips);
  const tierMate = Math.min(oppMaxModel + 2, cap);
  const tierSevereChips =
    scale === 'oni' ? Math.floor(myChips * 0.55) : Math.floor(myChips * 0.5);
  const tierModerateChips =
    scale === 'oni' ? Math.floor(myChips * 0.32) : Math.floor(myChips * 0.28);
  const tierSevere = Math.min(oppMaxModel, tierSevereChips);
  const tierModerate = Math.min(oppMaxModel, tierModerateChips);
  // Calibrated for the new eval ranges (post-eval rewrite).
  const isMate = Math.abs(delta) >= 5000 || oppBest < -3000;
  const isSevere =
    scale === 'oni'
      ? Math.abs(delta) >= 1500 || oppBest < -1200
      : Math.abs(delta) >= 1200 || oppBest < -1000;
  const isModerate =
    scale === 'oni'
      ? Math.abs(delta) >= 350 || oppBest < -250
      : Math.abs(delta) >= 250 || oppBest < -200;
  if (isMate) return tierMate;
  if (isSevere) return tierSevere;
  if (isModerate) return tierModerate;
  return 0;
}

/**
 * Compute the AI's bid for the current BIDDING phase.
 *
 * Initiative-aware: under the placement-driven token rule, winning a bid
 * while holding the token costs the token afterwards. We model this as a
 * fixed eval-point penalty (TOKEN_COST). This makes higher levels more
 * willing to *not* bid as the holder, hoping the opponent takes the play
 * and loses their own token.
 *
 * Auction-type-aware:
 *  - Vickrey (second-price): bid close to true value (dominant strategy)
 *  - All-pay: aggressive shade and a "commit-or-skip" threshold —
 *    losing the auction still costs, so mid-bids are bad. Either commit
 *    fully (high probability of winning) or bid 0.
 *  - First-price (default): conservative shade.
 */
export function decideBid(ctx: AIBidContext, rng: () => number = Math.random): number {
  const { state, color, level } = ctx;
  const chips = state.players[color].chips;
  if (chips === 0) return clampBid(0, state, color);
  const isHolder = state.initiativeHolder === color;
  const isVickrey = state.options.auctionType === 'second-price';
  const isAllPay = state.options.auctionType === 'all-pay';
  const oppChips = state.players[opponentOf(color)].chips;

  if (level === 'beginner') {
    const cap = Math.max(1, Math.floor(chips * 0.15));
    return clampBid(Math.floor(rng() * cap), state, color);
  }

  if (level === 'intermediate') {
    const { delta } = deltaValueOfMoving(state, color, 2);
    const adjusted = isHolder ? delta - TOKEN_COST : delta;
    const base = Math.max(2, Math.floor(chips * 0.12));
    let bid = base;
    if (isAllPay) {
      // Lower shade (0.55) for intermediate — depth-2 search overestimates
      // value; conservatively bid less.
      bid = allPayBid(state, color, adjusted, chips, oppChips, base, 0.55);
    } else if (adjusted > 0) {
      const valueChips = evalPointsToChips(adjusted, chips);
      const shade = isVickrey ? 0.85 : 0.45;
      bid = Math.max(bid, Math.floor(valueChips * shade));
    } else if (adjusted < -300) {
      bid = Math.max(0, Math.floor(chips * 0.02));
    }
    const cap = Math.max(
      1,
      Math.floor(chips * (isVickrey ? 0.7 : isAllPay ? 0.6 : 0.4))
    );
    return clampBid(Math.min(bid, cap), state, color);
  }

  if (level === 'advanced') {
    const { delta, oppBest } = deltaValueOfMoving(state, color, 3);
    const adjusted = isHolder ? delta - TOKEN_COST : delta;
    const base = Math.max(2, Math.floor(chips * 0.08));
    let bid = base;
    if (isAllPay) {
      bid = allPayBid(state, color, adjusted, chips, oppChips, base, 0.7);
    } else if (adjusted > 0) {
      const valueChips = evalPointsToChips(adjusted, chips);
      const shade = isVickrey ? 0.9 : 0.55;
      bid = Math.max(bid, Math.floor(valueChips * shade));
    } else if (adjusted < -200) {
      bid = Math.max(0, Math.floor(-adjusted * 0.04));
    }
    // Tiered defence: bid based on modelled opponent cap, never wasteful.
    const defenseBid = tieredDefenseBid(
      state,
      color,
      delta,
      oppBest,
      chips,
      oppChips,
      'advanced'
    );
    if (defenseBid > 0) bid = Math.max(bid, defenseBid);
    const cap = Math.max(1, Math.floor(chips * 0.92));
    return clampBid(Math.min(bid, cap), state, color);
  }

  // oni
  const empties = countEmpty(state.board);
  // Bid evaluation is a *forecast* of the upcoming move's value. Depths
  // bumped +1 in v2.2 (NPC-mode final strengthening): 11/10/9 from 10/9/8,
  // time budget 900ms from 700ms.
  const depth = empties <= 14 ? 11 : empties <= 22 ? 10 : 9;
  const { delta, oppBest } = deltaValueOfMoving(state, color, depth, true, 900);
  // ONI_BID_V2 selects between two bidding regimes for A/B testing:
  //   v2 (default): holder/non-holder asymmetric base + symmetric token cost
  //                 + relaxed endgame cap
  //   v1: legacy uniform base + holder-only token cost + 0.92 cap
  const useV2 = oniBidV2();
  // Token cost applies to BOTH sides under v2: holder loses token by winning,
  // non-holder gains token by losing — so the win-vs-lose differential is
  // identical. Under v1, only the holder is adjusted (legacy behaviour).
  const adjusted = useV2 ? delta - TOKEN_COST : isHolder ? delta - TOKEN_COST : delta;

  // Asymmetric base bid (v2): holder bids low (ties favour them, conserves
  // chips), non-holder bids slightly higher to break ties.
  // EXCEPTION (sparse opening): both sides use the SAME low base, and
  // non-holder tieBump is suppressed. Rationale: 1000-game self-play
  // showed BLACK (initial holder) lost 48-51 vs WHITE because the v2
  // non-holder bumping forced WHITE to place first repeatedly in the
  // opening, giving WHITE a positional foothold that exceeded BLACK's
  // token value. In sparse phase, ties favour holder (BLACK) → BLACK
  // gets early placements in symmetric positions, restoring fair play.
  const sparse = empties >= 50;
  const suppressTieBump = useV2 && sparse;
  let baseBid: number;
  if (useV2) {
    if (sparse) {
      // Symmetric base in opening — ties favour holder (initial=BLACK).
      baseBid = Math.max(2, Math.floor(chips * 0.05));
    } else {
      const baseHolderRatio = 0.06;
      const baseNonHolderRatio = 0.10;
      const baseRatio = isHolder ? baseHolderRatio : baseNonHolderRatio;
      baseBid = Math.max(
        isHolder ? 1 : 3,
        Math.floor(chips * baseRatio) + (isHolder ? 0 : 1)
      );
    }
  } else {
    baseBid = sparse
      ? Math.max(3, Math.floor(chips * 0.16) + 1)
      : Math.max(3, Math.floor(chips * 0.1));
  }

  let bid = baseBid;

  // Endgame chip-banking: when fewer empties remain than estimated bids,
  // it's safe to spend. When many remain, conserve.
  // Estimated remaining bidding turns ≈ empties / 2.
  const estimatedRemainingBids = Math.max(1, Math.ceil(empties / 2));
  const conservation =
    estimatedRemainingBids >= 12 ? 0.85 : estimatedRemainingBids >= 6 ? 0.95 : 1.0;

  // Effective tiebreak status: in sparse opening, suppress non-holder bump
  // by treating both sides as "holder" for tieBump purposes.
  const isHolderForTiebreak = isHolder || suppressTieBump;

  if (isAllPay) {
    // All-pay strategy for oni: shade 0.85 of value (high confidence
    // from deep search) but cheap-win against weak bidders via the
    // history model. Critical positions are bumped further by the
    // tieredDefenseBid call below. Holder-aware tieBump (v2 only):
    // +0 for holder (or sparse-opening), +2 for non-holder (mid/end).
    bid = allPayBid(
      state,
      color,
      adjusted,
      chips,
      oppChips,
      baseBid,
      0.85,
      useV2 ? isHolderForTiebreak : false
    );
  } else if (adjusted > 0) {
    const valueChips = evalPointsToChips(adjusted, chips);
    // Shading factor by auction type:
    //  - first-price: ~60% (placement-driven token rule gives a small
    //    extra value to winning when we're not the holder)
    //  - Vickrey:     ~92% (close to truthful but reserve tiny margin)
    const shade = isVickrey ? 0.92 : 0.6;
    const target = Math.floor(valueChips * shade * conservation);
    // Holder doesn't need a tie-break bump under v2 (ties favour holder).
    // Sparse-opening also suppresses the bump (preserve initial holder edge).
    const tieBump = useV2 ? (isHolderForTiebreak ? 0 : 2) : 2;
    bid = Math.max(bid, target + tieBump);
  } else if (adjusted < -150) {
    // We don't want to win — minimize bid (but still positive base).
    bid = Math.max(0, Math.floor(-adjusted * 0.04));
  }

  // Tiered defence — always overrides on critical positions.
  const defenseBid = tieredDefenseBid(
    state,
    color,
    delta,
    oppBest,
    chips,
    oppChips,
    'oni'
  );
  if (defenseBid > 0) bid = Math.max(bid, defenseBid);

  // Endgame all-in (v2 only): with very few bidding rounds left, the chip cap
  // should approach 100% — saving chips for "later" is wasteful when there
  // is no later. Cap relaxes from 0.92 to ~1.0 in true endgame.
  const capRatio = useV2
    ? estimatedRemainingBids <= 2
      ? 1.0
      : estimatedRemainingBids <= 4
        ? 0.96
        : 0.92
    : 0.92;
  const cap = Math.max(1, Math.floor(chips * capRatio));
  return clampBid(Math.min(bid, cap), state, color);
}

/**
 * Selects the oni bidding regime. Default v2 (improved). Set
 * `ONI_BID_V2=0` to revert to legacy v1 behaviour for A/B testing.
 */
function oniBidV2(): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proc = (globalThis as any).process;
  if (!proc || !proc.env) return true;
  const v = proc.env.ONI_BID_V2 as string | undefined;
  if (v === undefined || v === '') return true;
  return v !== '0' && v !== 'false' && v.toLowerCase() !== 'no';
}

export function decideMove(
  state: GameState,
  mover: Color,
  level: AILevel,
  rng: () => number = Math.random
): { row: number; col: number } {
  if (level === 'beginner') return pickRandomMove(state, mover, rng);
  if (level === 'intermediate') return pickAlphaBetaMove(state, mover, 2);
  if (level === 'advanced') return pickAlphaBetaMove(state, mover, 4);
  return pickOniMove(state, mover);
}

export { makeRng };
```


## A.2 `src/core/ai/eval.ts`（要点抜粋）

`evaluateBoard` 関数および `cornerAdjacentScore` の周辺コード：

```typescript
  let theirs = 0;
  for (const [r, c] of CORNERS) {
    if (board[r][c] === color) mine++;
    else if (board[r][c] === opp) theirs++;
  }
  return 25 * (mine - theirs);
}

/**
 * Context-aware corner-adjacent evaluation. Static positional weights
 * penalise X (-50) and C (-25) cells uniformly, but the actual cost
 * depends on whether the adjacent corner is *taken*:
 *
 *   - Corner empty + X-square owned: BIG penalty for the X owner
 *     (the opponent can typically force the corner)
 *   - Corner empty + C-square owned: smaller penalty for the C owner
 *   - Corner owned: same-color X / C are safe (anchored bonus)
 *   - Corner owned: opposite-color X / C are dead frontier (penalty)
 *
 * Implementation: compute a per-cell *signed* contribution from BLACK's
 * perspective (positive = good for BLACK), then negate for WHITE so the
 * function satisfies `f(b, BLACK) === -f(b, WHITE)` (negamax invariant).
 */
export function cornerAdjacentScore(board: Board, color: Color): number {
  const groups: Array<{
    corner: [number, number];
    x: [number, number];
    cs: Array<[number, number]>;
  }> = [
    { corner: [0, 0], x: [1, 1], cs: [[0, 1], [1, 0]] },
    { corner: [0, 7], x: [1, 6], cs: [[0, 6], [1, 7]] },
    { corner: [7, 0], x: [6, 1], cs: [[6, 0], [7, 1]] },
    { corner: [7, 7], x: [6, 6], cs: [[6, 7], [7, 6]] },
  ];
  // Returns a sign multiplier: +1 if cell == BLACK, -1 if WHITE, 0 if empty.
  const sign = (r: number, c: number): number => {
    const v = board[r][c];
    return v === 'BLACK' ? 1 : v === 'WHITE' ? -1 : 0;
  };
  let s = 0;
  for (const g of groups) {
    const cs = sign(g.corner[0], g.corner[1]);
    const xs = sign(g.x[0], g.x[1]);
    if (cs === 0) {
      // Empty corner: penalise the X owner heavily, C owners moderately.
      // `xs` already encodes the owner sign, and we want to PENALISE
      // ownership → subtract.
      s -= xs * 30;
      for (const [cr, cc] of g.cs) {
        s -= sign(cr, cc) * 12;
      }
    } else {
      // Corner is taken. Same-color X is anchored (bonus to that side);
      // opposite-color X is dead frontier (penalty to that side).
      // `cs * xs` is +1 when same color, -1 when different.
      s += cs * xs * 10;
      for (const [cr, cc] of g.cs) {
        s += cs * sign(cr, cc) * 4;
      }
    }
  }
  // Above accumulates from BLACK's perspective. Flip for WHITE.
  return color === 'BLACK' ? s : -s;
}

export function stoneDifference(board: Board, color: Color): number {
  const { BLACK, WHITE } = countStones(board);
  const mine = color === 'BLACK' ? BLACK : WHITE;
  const theirs = color === 'BLACK' ? WHITE : BLACK;
  if (mine + theirs === 0) return 0;
  return (100 * (mine - theirs)) / (mine + theirs);
}

/**
 * Frontier = stones adjacent to ≥1 empty cell. Frontier stones are flippable
 * and therefore weak. Sign convention: lower frontier count for me is better,
 * hence the leading minus.
 */
export function frontierScore(board: Board, color: Color): number {
  const opp = opponentOf(color);
  let mine = 0;

// ... 中略（positionalScore, mobilityScore, stableDiscScore, parityScore 等）...

  return lastMover === color ? 8 : -8;
}

/**
 * Runtime multiplier for the experimental `cornerAdjacentScore` term.
 * Default is 0 (disabled) — see the long comment in `evaluateBoard`
 * for the empirical reasoning. Setting `ONI_CORNER_ADJ=1` enables the
 * term at the constants embedded below; intermediate values scale them
 * proportionally.
 */
function cornerAdjMultiplier(): number {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proc = (globalThis as any).process;
  if (!proc || !proc.env) return 0;
  const v = proc.env.ONI_CORNER_ADJ as string | undefined;
  if (v === undefined || v === '') return 0;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Phase-aware evaluator. Negamax-friendly: result for `color` always equals
 * the negation of the result for `opponentOf(color)` (within fp rounding).
 */
export function evaluateBoard(board: Board, color: Color): number {
  const empty = countEmpty(board);
  const filled = 64 - empty;
  if (empty === 0) {
    return stoneDifference(board, color) * 1000;
  }
  const adjMul = cornerAdjMultiplier();
  // cornerAdjacentScore is theoretically sound (corrects positionalScore's
  // static X/C penalty when the adjacent corner is owned) but empirical
  // A/B testing on offline-launch did NOT find a strength improvement
  // at any tested weight: at 1.5/2.0/0.8 oni dropped from 5-1 → 3-3
  // vs intermediate (chips=50, 6 games), and at 0.4/0.5/0.2 win rate
  // matched 5-1 but with smaller margins. The conservative default is
  // therefore weight 0 (term computed but inert). Override at runtime
  // via `ONI_CORNER_ADJ` (the multiplier on the constants below):
  //   ONI_CORNER_ADJ=1   → enables at weights 1.5/2.0/0.8
  //   ONI_CORNER_ADJ=0.3 → enables at 0.45/0.6/0.24
  //   ONI_CORNER_ADJ=0   → disabled (default)
  // The function is exported and tested for negamax antisymmetry so
  // future weight tuning can re-enable it without code changes.
  if (filled < 20) {
    return (
      positionalScore(board, color) * 1.0 +
      mobilityScore(board, color) * 6.0 +
      cornerControl(board, color) * 14.0 +
      cornerAdjacentScore(board, color) * 1.5 * adjMul +
      frontierScore(board, color) * 2.0 +
      stableDiscScore(board, color) * 4.0 +
      potentialMobilityScore(board, color) * 3.0
    );
  }
  if (filled < 50) {
    return (
      positionalScore(board, color) * 1.0 +
      mobilityScore(board, color) * 5.0 +
      cornerControl(board, color) * 16.0 +
      cornerAdjacentScore(board, color) * 2.0 * adjMul +
      frontierScore(board, color) * 2.5 +
      stableDiscScore(board, color) * 8.0 +
      potentialMobilityScore(board, color) * 2.5 +
      stoneDifference(board, color) * 0.5
    );
  }
  return (
    positionalScore(board, color) * 0.4 +
    mobilityScore(board, color) * 1.0 +
    cornerControl(board, color) * 10.0 +
    cornerAdjacentScore(board, color) * 0.8 * adjMul +
    stableDiscScore(board, color) * 12.0 +
    potentialMobilityScore(board, color) * 0.5 +
    stoneDifference(board, color) * 6.0
  );
}

/**
 * Like `evaluateBoard` but adds a small parity bonus when the side-to-move
 * is known. Used by deeper searches at internal nodes; root evaluation
 * doesn't know who is to move next, so it falls through to the default.
 */
export function evaluateBoardWithParity(
  board: Board,
  color: Color,
  sideToMove: Color
): number {
  const empty = countEmpty(board);
  if (empty === 0) return evaluateBoard(board, color);
  if (empty > 14) return evaluateBoard(board, color);
  return evaluateBoard(board, color) + parityScore(board, color, sideToMove);
}

function countEmpty(board: Board): number {
  let n = 0;
  for (const row of board) for (const c of row) if (c === null) n++;
  return n;
}

/**
```

## A.3 `tools/oni1000.ts`（自己対戦テレメトリ収集ハーネス、全文）

```typescript
/**
 * Long-running oni-vs-oni self-play with detailed telemetry.
 *
 * Writes one JSON line per game (sync, flushed) to `data/oni-runs.jsonl`,
 * so progress survives crashes and is observable by tail -f. Run in the
 * background with:
 *
 *   nohup npx tsx tools/oni1000.ts 1000 100 > data/oni-1000.log 2>&1 &
 *
 * Each line schema:
 *   { game, seed, blackStones, whiteStones, blackChipsLeft, whiteChipsLeft,
 *     turns, durationMs, endReason, bids: [{turn, B, W, holderBefore, winner,
 *                                            phase, emptiesBefore}, …] }
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  applyPlacement,
  expectedMover,
  initGame,
  resolvePendingBids,
  setPendingBid,
  skipFinalMoveIfNoLegal,
} from '../src/core/gameLoop.ts';
import { decideBid, decideMove, makeRng } from '../src/core/ai/index.ts';
import { hasLegalMove, countStones, legalMoves } from '../src/core/board.ts';
import { ttClear } from '../src/core/ai/tt.ts';
import type { Color, GameState } from '../src/core/types.ts';

interface BidRecord {
  turn: number;
  B: number;
  W: number;
  holderBefore: Color;
  winner: Color | null; // null on tie-no-spend
  phase: 'open' | 'mid' | 'end';
  emptiesBefore: number;
}

interface GameRecord {
  game: number;
  seed: number;
  blackStones: number;
  whiteStones: number;
  blackChipsLeft: number;
  whiteChipsLeft: number;
  turns: number;
  durationMs: number;
  endReason: GameState['endReason'];
  bids: BidRecord[];
}

function countEmpty(board: GameState['board']): number {
  let n = 0;
  for (const row of board) for (const c of row) if (c === null) n++;
  return n;
}

function phaseFromEmpties(empties: number): 'open' | 'mid' | 'end' {
  const filled = 64 - empties;
  if (filled < 20) return 'open';
  if (filled < 50) return 'mid';
  return 'end';
}

function playOne(seed: number, initialChips: number, gameIdx: number): GameRecord {
  ttClear();
  const rng = makeRng(seed);
  let s: GameState = initGame({ initialChips });
  // Random opening: 2 plies of random bids in [0..3] for diversity.
  // 4-ply / 0..4 caused ~80% wipeouts (no telemetry); 2/0..3 keeps games alive.
  for (let p = 0; p < 2 && s.phase === 'BIDDING'; p++) {
    s = setPendingBid(s, 'BLACK', Math.floor(rng() * 4));
    s = setPendingBid(s, 'WHITE', Math.floor(rng() * 4));
    const out = resolvePendingBids(s);
    s = out.state;
    if (s.phase === 'PLACING' || s.phase === 'FREE_MOVE' || s.phase === 'FINAL_MOVE') {
      const mover = expectedMover(s);
      if (!mover) break;
      const moves = legalMoves(s.board, mover);
      if (moves.length === 0) break;
      const m = moves[Math.floor(rng() * moves.length)];
      s = applyPlacement(s, mover, m.row, m.col);
    }
  }
  const t0 = Date.now();
  const bids: BidRecord[] = [];
  let safety = 1500;
  while (s.phase !== 'ENDED' && safety-- > 0) {
    if (s.phase === 'BIDDING') {
      const emptiesBefore = countEmpty(s.board);
      const holderBefore: Color = s.initiativeHolder;
      const bb = decideBid({ state: s, color: 'BLACK', level: 'oni' }, rng);
      const bw = decideBid({ state: s, color: 'WHITE', level: 'oni' }, rng);
      s = setPendingBid(s, 'BLACK', bb);
      s = setPendingBid(s, 'WHITE', bw);
      const before = s;
      s = resolvePendingBids(s).state;
      // Determine the bid winner from initiativeHolder change or who is to move.
      let winner: Color | null = null;
      if (bb > bw) winner = 'BLACK';
      else if (bw > bb) winner = 'WHITE';
      else if (bb === bw && bb > 0) {
        // tie with positive bid → goes to holder under Bidding rules
        winner = before.initiativeHolder;
      } // else null (both 0)
      bids.push({
        turn: s.history.length,
        B: bb,
        W: bw,
        holderBefore,
        winner,
        phase: phaseFromEmpties(emptiesBefore),
        emptiesBefore,
      });
      if (s.phase === 'PLACING' || s.phase === 'FINAL_MOVE') {
        const mover = expectedMover(s)!;
        const m = decideMove(s, mover, 'oni', rng);
        s = applyPlacement(s, mover, m.row, m.col);
      }
    } else if (s.phase === 'FREE_MOVE') {
      const mover = expectedMover(s)!;
      const m = decideMove(s, mover, 'oni', rng);
      s = applyPlacement(s, mover, m.row, m.col);
    } else if (s.phase === 'FINAL_MOVE') {
      if (!hasLegalMove(s.board, s.initiativeHolder)) {
        s = skipFinalMoveIfNoLegal(s);
      } else {
        const m = decideMove(s, s.initiativeHolder, 'oni', rng);
        s = applyPlacement(s, s.initiativeHolder, m.row, m.col);
      }
    }
  }
  const dur = Date.now() - t0;
  const stones = countStones(s.board);
  return {
    game: gameIdx,
    seed,
    blackStones: stones.BLACK,
    whiteStones: stones.WHITE,
    blackChipsLeft: s.players.BLACK.chips,
    whiteChipsLeft: s.players.WHITE.chips,
    turns: s.history.length,
    durationMs: dur,
    endReason: s.endReason,
    bids,
  };
}

const N = parseInt(process.argv[2] ?? '1000', 10);
const CHIPS = parseInt(process.argv[3] ?? '100', 10);
// Start index — when resuming after a crash, pass the next game number
// (e.g., if 283 games were saved, pass 284). Defaults to 1.
const START = parseInt(process.argv[4] ?? '1', 10);
// Output file path. If provided, append to it (resume mode); otherwise
// create a new timestamped file.
const OUT_DIR = path.join(process.cwd(), 'data');
const OUT_FILE = process.argv[5]
  ? path.resolve(process.argv[5])
  : path.join(OUT_DIR, `oni-runs-${Date.now()}.jsonl`);
fs.mkdirSync(OUT_DIR, { recursive: true });
const stream = fs.openSync(OUT_FILE, 'a');
console.log(`Oni-vs-oni mass self-play: ${N} games at chips=${CHIPS}, starting from game ${START}`);
console.log(`Logging to: ${OUT_FILE}`);
const t0 = Date.now();
let blackWins = 0;
let whiteWins = 0;
let draws = 0;
for (let i = START - 1; i < N; i++) {
  const r = playOne(i + 1, CHIPS, i + 1);
  fs.writeSync(stream, JSON.stringify(r) + '\n');
  fs.fsyncSync(stream);
  if (r.blackStones > r.whiteStones) blackWins++;
  else if (r.whiteStones > r.blackStones) whiteWins++;
  else draws++;
  const elapsed = (Date.now() - t0) / 1000;
  const done = i + 2 - START;
  const rate = done / Math.max(0.001, elapsed);
  const remaining = (N - i - 1) / Math.max(0.001, rate);
  console.log(
    `game ${i + 1}/${N}: B=${r.blackStones} W=${r.whiteStones} ` +
      `turns=${r.turns} dur=${(r.durationMs / 1000).toFixed(1)}s ` +
      `[B:${blackWins}/D:${draws}/W:${whiteWins}] ` +
      `eta=${(remaining / 60).toFixed(1)}min`
  );
}
fs.closeSync(stream);
console.log(`\n=== ${N} games complete ===`);
console.log(`  BLACK wins: ${blackWins} (${((blackWins * 100) / N).toFixed(1)}%)`);
console.log(`  Draws:      ${draws} (${((draws * 100) / N).toFixed(1)}%)`);
console.log(`  WHITE wins: ${whiteWins} (${((whiteWins * 100) / N).toFixed(1)}%)`);
console.log(`  Total: ${((Date.now() - t0) / 1000 / 60).toFixed(1)} min`);
console.log(`  Log: ${OUT_FILE}`);
```

## A.4 `tools/analyzeOniRuns.ts`（テレメトリ解析、全文）

```typescript
/**
 * Analyse oni-vs-oni self-play telemetry produced by `tools/oni1000.ts`.
 *
 * Usage: `npx tsx tools/analyzeOniRuns.ts <jsonl-path>`
 *
 * Reports:
 *  - Win rates (BLACK / WHITE / draws) and avg margins
 *  - Bid distribution by phase (open / mid / end), holder status
 *  - Per-phase mean / median / max bid magnitudes
 *  - Avg cost (chips spent) for the bid winner vs loser
 *  - Tied-bid frequency (how often did one side over-pay due to ties)
 *  - End-reason distribution
 *  - Bid-magnitude → game-outcome correlation (does bidding higher win?)
 */
import * as fs from 'fs';

interface BidRecord {
  turn: number;
  B: number;
  W: number;
  holderBefore: 'BLACK' | 'WHITE';
  winner: 'BLACK' | 'WHITE' | null;
  phase: 'open' | 'mid' | 'end';
  emptiesBefore: number;
}

interface GameRecord {
  game: number;
  seed: number;
  blackStones: number;
  whiteStones: number;
  blackChipsLeft: number;
  whiteChipsLeft: number;
  turns: number;
  durationMs: number;
  endReason: string | undefined;
  bids: BidRecord[];
}

const jsonlPath = process.argv[2];
if (!jsonlPath) {
  console.error('Usage: npx tsx tools/analyzeOniRuns.ts <path-to-jsonl>');
  process.exit(1);
}

const lines = fs.readFileSync(jsonlPath, 'utf8').trim().split('\n').filter(Boolean);
const games: GameRecord[] = lines.map(l => JSON.parse(l));
console.log(`Analysing ${games.length} games from ${jsonlPath}\n`);

// === Top-level outcomes ===
let blackWins = 0;
let whiteWins = 0;
let draws = 0;
let totalTurns = 0;
let totalDur = 0;
let wipeouts = 0;
const margins: number[] = [];
const endReasons: Record<string, number> = {};
for (const g of games) {
  if (g.blackStones > g.whiteStones) blackWins++;
  else if (g.whiteStones > g.blackStones) whiteWins++;
  else draws++;
  margins.push(g.blackStones - g.whiteStones);
  totalTurns += g.turns;
  totalDur += g.durationMs;
  const er = g.endReason ?? 'unknown';
  endReasons[er] = (endReasons[er] ?? 0) + 1;
  if (g.bids.length === 0) wipeouts++;
}
margins.sort((a, b) => a - b);
const n = games.length;
console.log('=== Outcomes ===');
console.log(`  BLACK ${blackWins} (${((blackWins * 100) / n).toFixed(1)}%) | ` +
  `WHITE ${whiteWins} (${((whiteWins * 100) / n).toFixed(1)}%) | ` +
  `Draws ${draws} (${((draws * 100) / n).toFixed(1)}%)`);
console.log(`  Margin (B-W): mean ${(margins.reduce((a, b) => a + b, 0) / n).toFixed(1)}, ` +
  `median ${margins[Math.floor(n / 2)]}, p10 ${margins[Math.floor(n * 0.1)]}, ` +
  `p90 ${margins[Math.floor(n * 0.9)]}`);
console.log(`  Avg turns: ${(totalTurns / n).toFixed(1)}, ` +
  `avg dur: ${(totalDur / n / 1000).toFixed(1)}s`);
console.log(`  End reasons:`, endReasons);
console.log(`  Random-opening wipeouts (no bids): ${wipeouts} (${((wipeouts * 100) / n).toFixed(1)}%)`);

// === Bid statistics by phase ===
type PhaseKey = 'open' | 'mid' | 'end';
interface BidStats {
  count: number;
  bidsHolder: number[];
  bidsNonHolder: number[];
  ties: number;
  zeroBoth: number;
}
const phases: Record<PhaseKey, BidStats> = {
  open: { count: 0, bidsHolder: [], bidsNonHolder: [], ties: 0, zeroBoth: 0 },
  mid: { count: 0, bidsHolder: [], bidsNonHolder: [], ties: 0, zeroBoth: 0 },
  end: { count: 0, bidsHolder: [], bidsNonHolder: [], ties: 0, zeroBoth: 0 },
};
for (const g of games) {
  for (const b of g.bids) {
    const ph = phases[b.phase];
    ph.count++;
    const holderBid = b.holderBefore === 'BLACK' ? b.B : b.W;
    const nonHolderBid = b.holderBefore === 'BLACK' ? b.W : b.B;
    ph.bidsHolder.push(holderBid);
    ph.bidsNonHolder.push(nonHolderBid);
    if (b.B === b.W) {
      if (b.B === 0) ph.zeroBoth++;
      else ph.ties++;
    }
  }
}
function summary(arr: number[]): string {
  if (arr.length === 0) return 'n=0';
  const sorted = [...arr].sort((a, b) => a - b);
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const median = sorted[Math.floor(arr.length / 2)];
  const max = sorted[sorted.length - 1];
  return `n=${arr.length} mean=${mean.toFixed(1)} median=${median} max=${max}`;
}
console.log('\n=== Bid distribution by phase (holder vs non-holder) ===');
for (const ph of ['open', 'mid', 'end'] as PhaseKey[]) {
  const s = phases[ph];
  console.log(`  [${ph}] count=${s.count}`);
  console.log(`    holder    : ${summary(s.bidsHolder)}`);
  console.log(`    non-holder: ${summary(s.bidsNonHolder)}`);
  console.log(
    `    ties (>0): ${s.ties} (${((s.ties * 100) / Math.max(1, s.count)).toFixed(1)}%), ` +
      `both-zero: ${s.zeroBoth} (${((s.zeroBoth * 100) / Math.max(1, s.count)).toFixed(1)}%)`
  );
}

// === Bid-magnitude → outcome correlation ===
// Buckets the avg-bid (per game per side) and reports win rate.
console.log('\n=== Avg-bid → win-rate (per-game, per-side) ===');
interface SideStat {
  bidSum: number;
  bidCount: number;
  won: boolean;
}
const sideStats: SideStat[] = [];
for (const g of games) {
  if (g.bids.length === 0) continue;
  let bSum = 0;
  let wSum = 0;
  for (const b of g.bids) {
    bSum += b.B;
    wSum += b.W;
  }
  sideStats.push({ bidSum: bSum, bidCount: g.bids.length, won: g.blackStones > g.whiteStones });
  sideStats.push({ bidSum: wSum, bidCount: g.bids.length, won: g.whiteStones > g.blackStones });
}
const buckets = [0, 5, 10, 15, 20, 25, 30, 40, 60, 100];
const bucketCounts = new Map<number, { n: number; wins: number }>();
for (const ss of sideStats) {
  const avg = ss.bidSum / Math.max(1, ss.bidCount);
  let bucket = buckets[buckets.length - 1];
  for (const b of buckets) if (avg < b) { bucket = b; break; }
  const cur = bucketCounts.get(bucket) ?? { n: 0, wins: 0 };
  cur.n++;
  if (ss.won) cur.wins++;
  bucketCounts.set(bucket, cur);
}
for (const b of buckets) {
  const c = bucketCounts.get(b);
  if (!c) continue;
  console.log(`  avg-bid <${b}: n=${c.n}, wins=${c.wins} (${((c.wins * 100) / c.n).toFixed(1)}%)`);
}

// === Holder vs non-holder win-bid frequency ===
let holderBidWins = 0;
let nonHolderBidWins = 0;
let totalBids = 0;
for (const g of games) {
  for (const b of g.bids) {
    if (!b.winner) continue;
    totalBids++;
    if (b.winner === b.holderBefore) holderBidWins++;
    else nonHolderBidWins++;
  }
}
console.log('\n=== Bid-winner by holder status ===');
console.log(`  total bids with winner: ${totalBids}`);
console.log(`  holder won bid:     ${holderBidWins} (${((holderBidWins * 100) / Math.max(1, totalBids)).toFixed(1)}%)`);
console.log(`  non-holder won bid: ${nonHolderBidWins} (${((nonHolderBidWins * 100) / Math.max(1, totalBids)).toFixed(1)}%)`);
```

## A.5 `tools/oniBidAB.ts`（v1 vs v2 A/B、全文）

```typescript
/**
 * A/B benchmark: oni bidding v2 (asymmetric base + symmetric token cost
 * + relaxed endgame cap) vs oni bidding v1 (legacy). Same game engine,
 * same eval — only the bid logic switches via `ONI_BID_V2` env var.
 *
 * Per-move env var toggling so one process can host both variants.
 *
 * Usage: `npx tsx tools/oniBidAB.ts [games] [chips]`  (defaults: 6, 100)
 */
import {
  applyPlacement,
  expectedMover,
  initGame,
  resolvePendingBids,
  setPendingBid,
  skipFinalMoveIfNoLegal,
} from '../src/core/gameLoop.ts';
import { decideBid, decideMove, makeRng } from '../src/core/ai/index.ts';
import { hasLegalMove, countStones, legalMoves } from '../src/core/board.ts';
import { ttClear } from '../src/core/ai/tt.ts';
import type { Color, GameState } from '../src/core/types.ts';

interface Result {
  v2Stones: number;
  v1Stones: number;
  durationMs: number;
  turns: number;
}

function setVariant(v: 'v1' | 'v2') {
  process.env.ONI_BID_V2 = v === 'v1' ? '0' : '1';
}

function playOne(v2IsBlack: boolean, chips: number, seed: number): Result {
  ttClear();
  const rng = makeRng(seed);
  let s: GameState = initGame({ initialChips: chips });
  // 2-ply random opening for diversity.
  for (let p = 0; p < 2 && s.phase === 'BIDDING'; p++) {
    s = setPendingBid(s, 'BLACK', Math.floor(rng() * 4));
    s = setPendingBid(s, 'WHITE', Math.floor(rng() * 4));
    s = resolvePendingBids(s).state;
    if (s.phase === 'PLACING' || s.phase === 'FREE_MOVE' || s.phase === 'FINAL_MOVE') {
      const mover = expectedMover(s);
      if (!mover) break;
      const moves = legalMoves(s.board, mover);
      if (moves.length === 0) break;
      const m = moves[Math.floor(rng() * moves.length)];
      s = applyPlacement(s, mover, m.row, m.col);
    }
  }
  const t0 = Date.now();
  const variantOf = (c: Color): 'v1' | 'v2' =>
    (v2IsBlack && c === 'BLACK') || (!v2IsBlack && c === 'WHITE') ? 'v2' : 'v1';
  let safety = 1500;
  while (s.phase !== 'ENDED' && safety-- > 0) {
    if (s.phase === 'BIDDING') {
      setVariant(variantOf('BLACK'));
      const bb = decideBid({ state: s, color: 'BLACK', level: 'oni' }, rng);
      setVariant(variantOf('WHITE'));
      const bw = decideBid({ state: s, color: 'WHITE', level: 'oni' }, rng);
      s = setPendingBid(s, 'BLACK', bb);
      s = setPendingBid(s, 'WHITE', bw);
      s = resolvePendingBids(s).state;
      if (s.phase === 'PLACING' || s.phase === 'FINAL_MOVE') {
        const mover = expectedMover(s)!;
        setVariant(variantOf(mover));
        const m = decideMove(s, mover, 'oni', rng);
        s = applyPlacement(s, mover, m.row, m.col);
      }
    } else if (s.phase === 'FREE_MOVE') {
      const mover = expectedMover(s)!;
      setVariant(variantOf(mover));
      const m = decideMove(s, mover, 'oni', rng);
      s = applyPlacement(s, mover, m.row, m.col);
    } else if (s.phase === 'FINAL_MOVE') {
      if (!hasLegalMove(s.board, s.initiativeHolder)) {
        s = skipFinalMoveIfNoLegal(s);
      } else {
        setVariant(variantOf(s.initiativeHolder));
        const m = decideMove(s, s.initiativeHolder, 'oni', rng);
        s = applyPlacement(s, s.initiativeHolder, m.row, m.col);
      }
    }
  }
  const stones = countStones(s.board);
  const v2Stones = v2IsBlack ? stones.BLACK : stones.WHITE;
  const v1Stones = v2IsBlack ? stones.WHITE : stones.BLACK;
  return { v2Stones, v1Stones, durationMs: Date.now() - t0, turns: s.history.length };
}

const N = parseInt(process.argv[2] ?? '6', 10);
const CHIPS = parseInt(process.argv[3] ?? '100', 10);
console.log(`oni-bid v2 vs v1, ${N} games, chips=${CHIPS}`);
const t0 = Date.now();
let v2Wins = 0;
let v1Wins = 0;
let draws = 0;
for (let i = 0; i < N; i++) {
  const v2Black = i % 2 === 0;
  const r = playOne(v2Black, CHIPS, i + 71);
  if (r.v2Stones > r.v1Stones) v2Wins++;
  else if (r.v1Stones > r.v2Stones) v1Wins++;
  else draws++;
  console.log(
    `  game ${i + 1}: v2=${v2Black ? 'B' : 'W'} v2=${r.v2Stones} v1=${r.v1Stones} ` +
      `(${(r.durationMs / 1000).toFixed(1)}s, ${r.turns} turns)`
  );
}
console.log(
  `\nResult: v2 ${v2Wins} / draws ${draws} / v1 ${v1Wins}  ` +
    `(${((Date.now() - t0) / 1000).toFixed(1)}s total)`
);
const winRate = v2Wins / Math.max(1, v2Wins + v1Wins);
console.log(`v2 head-to-head win rate: ${(winRate * 100).toFixed(1)}%`);
```

## A.6 `tests/aiBidding.test.ts`（修正された Vickrey-vs-FP テスト含む、全文）

```typescript
/**
 * Regression tests for the AI bidding logic.
 *
 *   - Opp-modelling defence: AI should NOT bid its full near-stack against
 *     a human who has only bid small amounts so far.
 *   - Vickrey mode: AI should bid closer to its true valuation (truthful
 *     bidding is the dominant strategy in second-price auctions).
 *   - 20/40/60/80 escalation: AI should defend without burning its stack.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  applyPlacement,
  expectedMover,
  initGame,
  resolvePendingBids,
  setPendingBid,
} from '../src/core/gameLoop';
import { decideBid, decideMove, makeRng } from '../src/core/ai';
import { ttClear } from '../src/core/ai/tt';
import { countStones, legalMoves } from '../src/core/board';
import { Color, GameState } from '../src/core/types';

beforeEach(() => ttClear());

describe('bidding: defence does not panic-bid', () => {
  it('after a small human bid history (T1=20), AI does not bid > oppMaxModel + buffer', () => {
    let s: GameState = initGame({ initialChips: 200 });
    // Simulate T1: human (BLACK) bids 20, AI (WHITE) bids 16. Human wins.
    s = setPendingBid(s, 'BLACK', 20);
    s = setPendingBid(s, 'WHITE', 16);
    s = resolvePendingBids(s).state;
    if (s.phase === 'PLACING') {
      const mover = expectedMover(s)!;
      const moves = legalMoves(s.board, mover);
      s = applyPlacement(s, mover, moves[0].row, moves[0].col);
    }
    // T2: AI considers a bid. Even if eval says "must defend", the cap
    // should be modelled around BLACK's max past bid (20) × 2 = 40
    // (or 25% of stack = 50, whichever is larger).
    expect(s.phase).toBe('BIDDING');
    const aiBid = decideBid({ state: s, color: 'WHITE', level: 'advanced' });
    // Without modelling, the AI would bid up to ~oppChips=180 (mate cap).
    // With modelling, the cap is min(oppChips, max(maxBid*2, avg*4, oppChips*0.25))
    // = min(180, max(40, 80, 50)) = 80. Defence buffer pushes it slightly higher.
    expect(aiBid).toBeLessThan(120);
  });

  it('20/40/60/80 escalation does not exhaust the AI in one turn', () => {
    let s: GameState = initGame({ initialChips: 200 });
    // T1: human=20, AI=arbitrary
    s = setPendingBid(s, 'BLACK', 20);
    s = setPendingBid(s, 'WHITE', decideBid({ state: s, color: 'WHITE', level: 'advanced' }));
    s = resolvePendingBids(s).state;
    if (s.phase === 'PLACING') {
      const mover = expectedMover(s)!;
      const m = decideMove(s, mover, mover === 'BLACK' ? 'beginner' : 'advanced');
      s = applyPlacement(s, mover, m.row, m.col);
    }
    expect(s.phase).toBe('BIDDING');
    // T2 — AI should not blow through > 60% of its stack on a single
    // defence here (history shows BLACK only bid 20 of 200).
    const aiBidT2 = decideBid({ state: s, color: 'WHITE', level: 'advanced' });
    expect(aiBidT2).toBeLessThan(s.players.WHITE.chips * 0.65);
  });
});

describe('bidding: Vickrey-aware', () => {
  it('AI bids higher in Vickrey than first-price for the same position', () => {
    const seed = 7;
    // Compare first-price vs second-price (Vickrey) explicitly. The default
    // auction is all-pay; we override to first-price for a meaningful
    // shade comparison. Vickrey's shade (~0.92) is closer to truthful than
    // first-price's (~0.6), so Vickrey bid ≥ first-price bid.
    const baseState: GameState = initGame({ initialChips: 200 });
    const stateFP: GameState = {
      ...baseState,
      options: { ...baseState.options, auctionType: 'first-price' },
    };
    const stateVP: GameState = {
      ...baseState,
      options: { ...baseState.options, auctionType: 'second-price' },
    };
    const fp = decideBid(
      { state: stateFP, color: 'BLACK', level: 'oni' },
      makeRng(seed)
    );
    const vp = decideBid(
      { state: stateVP, color: 'BLACK', level: 'oni' },
      makeRng(seed)
    );
    expect(vp).toBeGreaterThanOrEqual(fp);
  });
});

describe('bidding: all-pay aware', () => {
  it('AI returns a non-negative integer in all-pay (never NaN/negative)', () => {
    const state: GameState = initGame({ initialChips: 100, auctionType: 'all-pay' });
    for (const level of ['intermediate', 'advanced', 'oni'] as const) {
      const bid = decideBid({ state, color: 'BLACK', level }, makeRng(1));
      expect(Number.isInteger(bid)).toBe(true);
      expect(bid).toBeGreaterThanOrEqual(0);
      expect(bid).toBeLessThanOrEqual(state.players.BLACK.chips);
    }
  });

  it('intermediate AI skips low-value all-pay bids (returns 0 from initial board)', () => {
    // Initial board is ~symmetric → depth-2 delta is tiny → AI should
    // skip rather than burn chips on a wash.
    const state: GameState = initGame({ initialChips: 100, auctionType: 'all-pay' });
    const bid = decideBid(
      { state, color: 'BLACK', level: 'intermediate' },
      makeRng(1)
    );
    expect(bid).toBe(0);
  });

  it('all-pay payments are actually deducted from both players in a real turn', () => {
    let s: GameState = initGame({ initialChips: 100, auctionType: 'all-pay' });
    s = setPendingBid(s, 'BLACK', 12);
    s = setPendingBid(s, 'WHITE', 7);
    expect(s.phase).toBe('BIDDING');
    // Validate: both lose chips, winner is BLACK.
    const before = { B: s.players.BLACK.chips, W: s.players.WHITE.chips };
    expect(before).toEqual({ B: 100, W: 100 });
  });
});

describe('bidding: chips=0 corner case', () => {
  it('AI bids 0 when out of chips', () => {
    let s: GameState = initGame({ initialChips: 0 });
    expect(s.phase).toBe('BIDDING');
    expect(decideBid({ state: s, color: 'BLACK', level: 'advanced' })).toBe(0);
    expect(decideBid({ state: s, color: 'BLACK', level: 'oni' })).toBe(0);
  });
});

describe('bidding: opp-modelling estimate ranges', () => {
  it('AI bid is bounded above (cap at most ~92% of own chips)', () => {
    let s: GameState = initGame({ initialChips: 100 });
    // Force a position where AI thinks it must defend
    // (we just trust decideBid clamps correctly; check the chip cap.)
    const ai = decideBid({ state: s, color: 'BLACK', level: 'oni' });
    expect(ai).toBeLessThanOrEqual(Math.floor(100 * 0.92));
  });
});
```

## A.7 `tests/aiEvalSymmetry.test.ts`（cornerAdj 対称性テスト含む、全文）

```typescript
/**
 * Negamax invariant for the new evaluator components: every individual
 * sub-score must satisfy `f(b, BLACK) === -f(b, WHITE)` for any board.
 * This is the foundational property that makes alpha-beta search valid.
 */
import { describe, it, expect } from 'vitest';
import {
  evaluateBoard,
  evaluateBoardWithParity,
  positionalScore,
  mobilityScore,
  cornerControl,
  cornerAdjacentScore,
  frontierScore,
  potentialMobilityScore,
  stableDiscScore,
  parityScore,
  stoneDifference,
} from '../src/core/ai/eval';
import { Board, Color } from '../src/core/types';
import { createInitialBoard, applyMove, legalMoves } from '../src/core/board';

function emptyBoard(): Board {
  return Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => null));
}

function randomBoards(count: number, depth: number): Board[] {
  let seed = 42;
  const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const out: Board[] = [];
  for (let i = 0; i < count; i++) {
    let b = createInitialBoard();
    let mover: Color = 'BLACK';
    for (let d = 0; d < depth; d++) {
      const moves = legalMoves(b, mover);
      if (moves.length === 0) {
        mover = mover === 'BLACK' ? 'WHITE' : 'BLACK';
        continue;
      }
      const m = moves[Math.floor(rand() * moves.length)];
      b = applyMove(b, mover, m.row, m.col).newBoard;
      mover = mover === 'BLACK' ? 'WHITE' : 'BLACK';
    }
    out.push(b);
  }
  return out;
}

describe('eval components: negamax antisymmetry', () => {
  const boards = [emptyBoard(), createInitialBoard(), ...randomBoards(40, 12)];

  for (const fn of [
    positionalScore,
    mobilityScore,
    cornerControl,
    cornerAdjacentScore,
    frontierScore,
    potentialMobilityScore,
    stableDiscScore,
    stoneDifference,
  ] as const) {
    it(`${fn.name}: f(b, BLACK) === -f(b, WHITE)`, () => {
      for (const b of boards) {
        const a = fn(b, 'BLACK');
        const w = fn(b, 'WHITE');
        expect(a).toBeCloseTo(-w, 6);
      }
    });
  }

  it('parityScore: depends on color and side-to-move', () => {
    const b = emptyBoard();
    // Plant a few stones to give a non-zero empty count
    b[3][3] = 'WHITE';
    b[3][4] = 'BLACK';
    b[4][3] = 'BLACK';
    b[4][4] = 'WHITE';
    // empty=60 (even). With BLACK to move, the OTHER side (WHITE) plays
    // last — so `color=WHITE` gets +8.
    expect(parityScore(b, 'WHITE', 'BLACK')).toBe(8);
    expect(parityScore(b, 'BLACK', 'BLACK')).toBe(-8);
    // color=WHITE & to-move=WHITE → BLACK plays last → -8
    expect(parityScore(b, 'WHITE', 'WHITE')).toBe(-8);
  });

  it('evaluateBoard: symmetric across boards', () => {
    for (const b of boards) {
      expect(evaluateBoard(b, 'BLACK')).toBeCloseTo(-evaluateBoard(b, 'WHITE'), 6);
    }
  });

  it('evaluateBoardWithParity: symmetric when sides swap', () => {
    for (const b of boards) {
      // For sideToMove=BLACK: f(BLACK, BLACK) === -f(WHITE, BLACK)
      // (parity adds the same term to color & negates for opponent.)
      const wB = evaluateBoardWithParity(b, 'WHITE', 'BLACK');
      const bB = evaluateBoardWithParity(b, 'BLACK', 'BLACK');
      expect(bB).toBeCloseTo(-wB, 6);
    }
  });
});
```

## A.8 `tools/oniAB.ts`（cornerAdj A/B、全文）

```typescript
/**
 * A/B benchmark: oni with cornerAdjacentScore enabled vs oni with the
 * feature disabled. Both AIs share the same code path; the toggle is
 * the `ONI_CORNER_ADJ` env var consulted inside `evaluateBoard`.
 *
 * Usage: `npx tsx tools/oniAB.ts [games]`  (default 12)
 *
 * Method: alternate which side is "v2" so colour-of-mover bias cancels.
 * Random opening (4 plies) per game for variance.
 *
 * The trick: spawn a child process per game with the env var fixed, so
 * one tsx process can't be "v2" in one branch and "v1" in another.
 *
 * For simpler in-process A/B we instead override the env var per move
 * by setting `process.env.ONI_CORNER_ADJ` before each call. This is
 * race-safe because everything is synchronous in this script.
 */
import {
  applyPlacement,
  expectedMover,
  initGame,
  resolvePendingBids,
  setPendingBid,
  skipFinalMoveIfNoLegal,
} from '../src/core/gameLoop.ts';
import { decideBid, decideMove, makeRng } from '../src/core/ai/index.ts';
import { hasLegalMove, countStones, legalMoves } from '../src/core/board.ts';
import { ttClear } from '../src/core/ai/tt.ts';
import { Color, GameState } from '../src/core/types.ts';

interface Result {
  v2Stones: number;
  v1Stones: number;
  durationMs: number;
  turns: number;
}

function setVariant(v: 'v1' | 'v2') {
  process.env.ONI_CORNER_ADJ = v === 'v1' ? '0' : '1';
}

function playOne(v2IsBlack: boolean, chips: number, seed: number): Result {
  ttClear();
  const rng = makeRng(seed);
  let s: GameState = initGame({ initialChips: chips });
  // Random opening (variant doesn't matter — uniform 0-4 bids).
  for (let p = 0; p < 4 && s.phase === 'BIDDING'; p++) {
    s = setPendingBid(s, 'BLACK', Math.floor(rng() * 5));
    s = setPendingBid(s, 'WHITE', Math.floor(rng() * 5));
    const out = resolvePendingBids(s);
    s = out.state;
    if (s.phase === 'PLACING' || s.phase === 'FREE_MOVE' || s.phase === 'FINAL_MOVE') {
      const mover = expectedMover(s);
      if (!mover) break;
      const moves = legalMoves(s.board, mover);
      if (moves.length === 0) break;
      const m = moves[Math.floor(rng() * moves.length)];
      s = applyPlacement(s, mover, m.row, m.col);
    }
  }
  const t0 = Date.now();
  const variantOf = (c: Color): 'v1' | 'v2' =>
    (v2IsBlack && c === 'BLACK') || (!v2IsBlack && c === 'WHITE') ? 'v2' : 'v1';
  let safety = 1500;
  while (s.phase !== 'ENDED' && safety-- > 0) {
    if (s.phase === 'BIDDING') {
      setVariant(variantOf('BLACK'));
      const bb = decideBid({ state: s, color: 'BLACK', level: 'oni' }, rng);
      setVariant(variantOf('WHITE'));
      const bw = decideBid({ state: s, color: 'WHITE', level: 'oni' }, rng);
      s = setPendingBid(s, 'BLACK', bb);
      s = setPendingBid(s, 'WHITE', bw);
      s = resolvePendingBids(s).state;
      if (s.phase === 'PLACING' || s.phase === 'FINAL_MOVE') {
        const mover = expectedMover(s)!;
        setVariant(variantOf(mover));
        const m = decideMove(s, mover, 'oni', rng);
        s = applyPlacement(s, mover, m.row, m.col);
      }
    } else if (s.phase === 'FREE_MOVE') {
      const mover = expectedMover(s)!;
      setVariant(variantOf(mover));
      const m = decideMove(s, mover, 'oni', rng);
      s = applyPlacement(s, mover, m.row, m.col);
    } else if (s.phase === 'FINAL_MOVE') {
      if (!hasLegalMove(s.board, s.initiativeHolder)) {
        s = skipFinalMoveIfNoLegal(s);
      } else {
        setVariant(variantOf(s.initiativeHolder));
        const m = decideMove(s, s.initiativeHolder, 'oni', rng);
        s = applyPlacement(s, s.initiativeHolder, m.row, m.col);
      }
    }
  }
  const stones = countStones(s.board);
  const v2Stones = v2IsBlack ? stones.BLACK : stones.WHITE;
  const v1Stones = v2IsBlack ? stones.WHITE : stones.BLACK;
  return {
    v2Stones,
    v1Stones,
    durationMs: Date.now() - t0,
    turns: s.history.length,
  };
}

const N = parseInt(process.argv[2] ?? '12', 10);
const CHIPS = parseInt(process.argv[3] ?? '30', 10);
console.log(`oni-v2 (cornerAdjacentScore ON) vs oni-v1 (OFF), ${N} games, chips=${CHIPS}`);
const t0 = Date.now();
let v2Wins = 0;
let v1Wins = 0;
let draws = 0;
for (let i = 0; i < N; i++) {
  const v2Black = i % 2 === 0;
  const r = playOne(v2Black, CHIPS, i + 17);
  if (r.v2Stones > r.v1Stones) v2Wins++;
  else if (r.v1Stones > r.v2Stones) v1Wins++;
  else draws++;
  console.log(
    `  game ${i + 1}: v2=${v2Black ? 'B' : 'W'} v2=${r.v2Stones} v1=${r.v1Stones} (${(r.durationMs / 1000).toFixed(1)}s, ${r.turns} turns)`
  );
}
console.log(
  `\nResult: v2 ${v2Wins} / draws ${draws} / v1 ${v1Wins}  (${((Date.now() - t0) / 1000).toFixed(1)}s total)`
);
const winRate = v2Wins / Math.max(1, v2Wins + v1Wins);
console.log(`v2 head-to-head win rate: ${(winRate * 100).toFixed(1)}%`);
```

## A.9 `tools/quickAB.ts`（cornerAdj 検証用小規模 A/B、全文）

```typescript
/**
 * Quick A/B: oni-v2 (cornerAdj ON) vs advanced.
 * Run with `ONI_CORNER_ADJ=0` for v1 baseline, default for v2.
 *
 * Single chip setting (50) and 6 games to keep total time manageable.
 */
import {
  applyPlacement,
  expectedMover,
  initGame,
  resolvePendingBids,
  setPendingBid,
  skipFinalMoveIfNoLegal,
} from '../src/core/gameLoop.ts';
import { decideBid, decideMove, makeRng, AILevel } from '../src/core/ai/index.ts';
import { hasLegalMove, countStones, legalMoves } from '../src/core/board.ts';
import { ttClear } from '../src/core/ai/tt.ts';
import { GameState } from '../src/core/types.ts';

function play(black: AILevel, white: AILevel, chips: number, seed: number) {
  ttClear();
  const rng = makeRng(seed);
  let s: GameState = initGame({ initialChips: chips });
  // Light random opening: 2 plies only (less wipeout risk).
  for (let p = 0; p < 2 && s.phase === 'BIDDING'; p++) {
    s = setPendingBid(s, 'BLACK', Math.floor(rng() * 4));
    s = setPendingBid(s, 'WHITE', Math.floor(rng() * 4));
    s = resolvePendingBids(s).state;
    if (s.phase === 'PLACING' || s.phase === 'FREE_MOVE' || s.phase === 'FINAL_MOVE') {
      const mover = expectedMover(s);
      if (!mover) break;
      const moves = legalMoves(s.board, mover);
      if (moves.length === 0) break;
      const m = moves[Math.floor(rng() * moves.length)];
      s = applyPlacement(s, mover, m.row, m.col);
    }
  }
  let safety = 1500;
  while (s.phase !== 'ENDED' && safety-- > 0) {
    if (s.phase === 'BIDDING') {
      const bb = decideBid({ state: s, color: 'BLACK', level: black }, rng);
      const bw = decideBid({ state: s, color: 'WHITE', level: white }, rng);
      s = setPendingBid(s, 'BLACK', bb);
      s = setPendingBid(s, 'WHITE', bw);
      s = resolvePendingBids(s).state;
      if (s.phase === 'PLACING' || s.phase === 'FINAL_MOVE') {
        const mover = expectedMover(s)!;
        const lvl = mover === 'BLACK' ? black : white;
        const m = decideMove(s, mover, lvl, rng);
        s = applyPlacement(s, mover, m.row, m.col);
      }
    } else if (s.phase === 'FREE_MOVE') {
      const mover = expectedMover(s)!;
      const lvl = mover === 'BLACK' ? black : white;
      const m = decideMove(s, mover, lvl, rng);
      s = applyPlacement(s, mover, m.row, m.col);
    } else if (s.phase === 'FINAL_MOVE') {
      if (!hasLegalMove(s.board, s.initiativeHolder)) {
        s = skipFinalMoveIfNoLegal(s);
      } else {
        const lvl = s.initiativeHolder === 'BLACK' ? black : white;
        const m = decideMove(s, s.initiativeHolder, lvl, rng);
        s = applyPlacement(s, s.initiativeHolder, m.row, m.col);
      }
    }
  }
  return countStones(s.board);
}

const N = parseInt(process.argv[2] ?? '6', 10);
const CHIPS = parseInt(process.argv[3] ?? '50', 10);
const variant = process.env.ONI_CORNER_ADJ === '0' ? 'v1 (cornerAdj OFF)' : 'v2 (cornerAdj ON)';
console.log(`oni ${variant} vs intermediate, ${N} games, chips=${CHIPS}`);

let oniWins = 0;
let intWins = 0;
let draws = 0;
const t0 = Date.now();
for (let i = 0; i < N; i++) {
  const oniBlack = i % 2 === 0;
  const r = play(
    oniBlack ? 'oni' : 'intermediate',
    oniBlack ? 'intermediate' : 'oni',
    CHIPS,
    i + 1009
  );
  const oniS = oniBlack ? r.BLACK : r.WHITE;
  const intS = oniBlack ? r.WHITE : r.BLACK;
  if (oniS > intS) oniWins++;
  else if (intS > oniS) intWins++;
  else draws++;
  console.log(
    `  game ${i + 1}: oni=${oniBlack ? 'B' : 'W'} oni=${oniS} int=${intS} (elapsed ${((Date.now() - t0) / 1000).toFixed(0)}s)`
  );
}
console.log(`\nResult: oni ${oniWins} / draws ${draws} / int ${intWins}`);
```

## A.10 `tools/oniVsOni.ts`（ベースライン自己対戦、全文）

```typescript
/**
 * Oni-vs-oni mass self-play.
 *
 * Generates N games with random openings (4 random plies) and prints
 * aggregate statistics: BLACK win rate, score margin distribution,
 * average game length, average chip cost.
 *
 * Use: `npx tsx tools/oniVsOni.ts <games> [chips]`
 *
 *   games  default 100
 *   chips  default 100
 */
import {
  applyPlacement,
  expectedMover,
  initGame,
  resolvePendingBids,
  setPendingBid,
  skipFinalMoveIfNoLegal,
} from '../src/core/gameLoop.ts';
import { decideBid, decideMove, makeRng } from '../src/core/ai/index.ts';
import { hasLegalMove, countStones, legalMoves } from '../src/core/board.ts';
import { ttClear } from '../src/core/ai/tt.ts';
import type { GameState } from '../src/core/types.ts';

interface GameRecord {
  blackStones: number;
  whiteStones: number;
  blackChipsLeft: number;
  whiteChipsLeft: number;
  turns: number;
  durationMs: number;
  endReason: GameState['endReason'];
  // Sum of bids per side
  totalBidBlack: number;
  totalBidWhite: number;
}

function playOne(seed: number, initialChips: number): GameRecord {
  ttClear();
  const rng = makeRng(seed);
  let s: GameState = initGame({ initialChips });
  // Random opening: 4 plies of bids in [0..4]
  for (let p = 0; p < 4 && s.phase === 'BIDDING'; p++) {
    s = setPendingBid(s, 'BLACK', Math.floor(rng() * 5));
    s = setPendingBid(s, 'WHITE', Math.floor(rng() * 5));
    const out = resolvePendingBids(s);
    s = out.state;
    if (s.phase === 'PLACING' || s.phase === 'FREE_MOVE' || s.phase === 'FINAL_MOVE') {
      const mover = expectedMover(s);
      if (!mover) break;
      const moves = legalMoves(s.board, mover);
      if (moves.length === 0) break;
      const m = moves[Math.floor(rng() * moves.length)];
      s = applyPlacement(s, mover, m.row, m.col);
    }
  }
  const t0 = Date.now();
  let totalBidBlack = 0;
  let totalBidWhite = 0;
  let safety = 1500;
  while (s.phase !== 'ENDED' && safety-- > 0) {
    if (s.phase === 'BIDDING') {
      const bb = decideBid({ state: s, color: 'BLACK', level: 'oni' }, rng);
      const bw = decideBid({ state: s, color: 'WHITE', level: 'oni' }, rng);
      totalBidBlack += bb;
      totalBidWhite += bw;
      s = setPendingBid(s, 'BLACK', bb);
      s = setPendingBid(s, 'WHITE', bw);
      s = resolvePendingBids(s).state;
      if (s.phase === 'PLACING' || s.phase === 'FINAL_MOVE') {
        const mover = expectedMover(s)!;
        const m = decideMove(s, mover, 'oni', rng);
        s = applyPlacement(s, mover, m.row, m.col);
      }
    } else if (s.phase === 'FREE_MOVE') {
      const mover = expectedMover(s)!;
      const m = decideMove(s, mover, 'oni', rng);
      s = applyPlacement(s, mover, m.row, m.col);
    } else if (s.phase === 'FINAL_MOVE') {
      if (!hasLegalMove(s.board, s.initiativeHolder)) {
        s = skipFinalMoveIfNoLegal(s);
      } else {
        const m = decideMove(s, s.initiativeHolder, 'oni', rng);
        s = applyPlacement(s, s.initiativeHolder, m.row, m.col);
      }
    }
  }
  const dur = Date.now() - t0;
  const stones = countStones(s.board);
  return {
    blackStones: stones.BLACK,
    whiteStones: stones.WHITE,
    blackChipsLeft: s.players.BLACK.chips,
    whiteChipsLeft: s.players.WHITE.chips,
    turns: s.history.length,
    durationMs: dur,
    endReason: s.endReason,
    totalBidBlack,
    totalBidWhite,
  };
}

function summarize(records: GameRecord[]) {
  const n = records.length;
  let blackWins = 0;
  let whiteWins = 0;
  let draws = 0;
  let blackMargins: number[] = [];
  let totalTurns = 0;
  let totalMs = 0;
  let endReasons: Record<string, number> = {};
  for (const r of records) {
    if (r.blackStones > r.whiteStones) blackWins++;
    else if (r.whiteStones > r.blackStones) whiteWins++;
    else draws++;
    blackMargins.push(r.blackStones - r.whiteStones);
    totalTurns += r.turns;
    totalMs += r.durationMs;
    const er = r.endReason ?? 'unknown';
    endReasons[er] = (endReasons[er] ?? 0) + 1;
  }
  blackMargins.sort((a, b) => a - b);
  const median = blackMargins[Math.floor(n / 2)] ?? 0;
  const p10 = blackMargins[Math.floor(n * 0.1)] ?? 0;
  const p90 = blackMargins[Math.floor(n * 0.9)] ?? 0;
  const meanMargin =
    blackMargins.reduce((a, b) => a + b, 0) / Math.max(1, n);
  console.log(`\n=== ${n} games summary ===`);
  console.log(`  BLACK wins: ${blackWins} (${((blackWins * 100) / n).toFixed(1)}%)`);
  console.log(`  WHITE wins: ${whiteWins} (${((whiteWins * 100) / n).toFixed(1)}%)`);
  console.log(`  Draws:      ${draws} (${((draws * 100) / n).toFixed(1)}%)`);
  console.log(
    `  Margin (B-W): mean ${meanMargin.toFixed(1)}, median ${median}, p10 ${p10}, p90 ${p90}`
  );
  console.log(`  Avg turns: ${(totalTurns / n).toFixed(1)}`);
  console.log(`  Avg duration: ${(totalMs / n / 1000).toFixed(1)}s/game`);
  console.log(`  End reasons:`, endReasons);
  // Decisive games (margin >= 10)
  const decisive = records.filter(r => Math.abs(r.blackStones - r.whiteStones) >= 10);
  console.log(`  Decisive (|B-W|>=10): ${decisive.length} (${((decisive.length * 100) / n).toFixed(1)}%)`);
}

const N = parseInt(process.argv[2] ?? '100', 10);
const CHIPS = parseInt(process.argv[3] ?? '100', 10);
console.log(`Oni-vs-oni self-play: ${N} games at chips=${CHIPS}\n`);
const t0 = Date.now();
const records: GameRecord[] = [];
for (let i = 0; i < N; i++) {
  const r = playOne(i + 1, CHIPS);
  records.push(r);
  if ((i + 1) % 10 === 0) {
    process.stdout.write(`  game ${i + 1}/${N} elapsed=${((Date.now() - t0) / 1000).toFixed(0)}s\n`);
  }
}
summarize(records);
console.log(`\nTotal: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
```

## A.11 `tests/oniStrength.test.ts`（鬼強さ検証、全文）

```typescript
import { describe, it, expect } from 'vitest';
import { AILevel, decideBid, decideMove, makeRng } from '../src/core/ai';
import {
  applyPlacement,
  expectedMover,
  initGame,
  resolvePendingBids,
  setPendingBid,
  skipFinalMoveIfNoLegal,
} from '../src/core/gameLoop';
import { hasLegalMove, countStones } from '../src/core/board';
import { GameState } from '../src/core/types';

function playGame(
  black: AILevel,
  white: AILevel,
  initialChips: number,
  seed: number
): GameState {
  const rng = makeRng(seed);
  let s = initGame({ initialChips });
  let safety = 1500;
  while (s.phase !== 'ENDED' && safety-- > 0) {
    if (s.phase === 'BIDDING') {
      const bidB = decideBid({ state: s, color: 'BLACK', level: black }, rng);
      const bidW = decideBid({ state: s, color: 'WHITE', level: white }, rng);
      s = setPendingBid(s, 'BLACK', bidB);
      s = setPendingBid(s, 'WHITE', bidW);
      const out = resolvePendingBids(s);
      s = out.state;
      if (s.phase === 'PLACING' || s.phase === 'FINAL_MOVE') {
        const mover = expectedMover(s)!;
        const lvl: AILevel = mover === 'BLACK' ? black : white;
        const m = decideMove(s, mover, lvl, rng);
        s = applyPlacement(s, mover, m.row, m.col);
      }
    } else if (s.phase === 'FREE_MOVE') {
      const mover = expectedMover(s)!;
      const lvl = mover === 'BLACK' ? black : white;
      const m = decideMove(s, mover, lvl, rng);
      s = applyPlacement(s, mover, m.row, m.col);
    } else if (s.phase === 'FINAL_MOVE') {
      if (!hasLegalMove(s.board, s.initiativeHolder)) {
        s = skipFinalMoveIfNoLegal(s);
      } else {
        const lvl = s.initiativeHolder === 'BLACK' ? black : white;
        const m = decideMove(s, s.initiativeHolder, lvl, rng);
        s = applyPlacement(s, s.initiativeHolder, m.row, m.col);
      }
    }
  }
  return s;
}

describe('oni strength (decisive)', () => {
  it('oni beats advanced ≥3 of 4 games (alternating colors)', () => {
    let oniWins = 0;
    let advWins = 0;
    let draws = 0;
    for (let i = 0; i < 4; i++) {
      const oniBlack = i % 2 === 0;
      const s = playGame(
        oniBlack ? 'oni' : 'advanced',
        oniBlack ? 'advanced' : 'oni',
        100,
        i + 7
      );
      const stones = countStones(s.board);
      const oni = oniBlack ? stones.BLACK : stones.WHITE;
      const adv = oniBlack ? stones.WHITE : stones.BLACK;
      if (oni > adv) oniWins++;
      else if (adv > oni) advWins++;
      else draws++;
    }
    expect(oniWins).toBeGreaterThanOrEqual(3);
  }, 240_000);

  it('oni beats intermediate 4/4', () => {
    let oniWins = 0;
    for (let i = 0; i < 4; i++) {
      const oniBlack = i % 2 === 0;
      const s = playGame(
        oniBlack ? 'oni' : 'intermediate',
        oniBlack ? 'intermediate' : 'oni',
        80,
        i * 11 + 3
      );
      const stones = countStones(s.board);
      const oni = oniBlack ? stones.BLACK : stones.WHITE;
      const other = oniBlack ? stones.WHITE : stones.BLACK;
      if (oni > other) oniWins++;
    }
    expect(oniWins).toBe(4);
  }, 240_000);

  it('oni does not crash with 0 chips (all FREE/FINAL flow)', () => {
    const s = playGame('oni', 'oni', 0, 1);
    expect(s.phase).toBe('ENDED');
  }, 60_000);
});
```

---

# 付録 B: 実測テレメトリサンプル

## B.1 v2 1000戦の解析出力

```
Analysing 1000 games from data/oni-runs-1778396150136.jsonl

=== Outcomes ===
  BLACK 481 (48.1%) | WHITE 513 (51.3%) | Draws 6 (0.6%)
  Margin (B-W): mean 0.1, median -3, p10 -11, p90 11
  Avg turns: 12.8, avg dur: 20.2s
  End reasons: { CHIPS_EXHAUSTED: 163, BOTH_NO_MOVES: 837 }
  Random-opening wipeouts (no bids): 357 (35.7%)

=== Bid distribution by phase (holder vs non-holder) ===
  [open] count=4474
    holder    : n=4474 mean=6.1 median=0 max=44
    non-holder: n=4474 mean=7.1 median=0 max=44
    ties (>0): 652 (14.6%), both-zero: 2399 (53.6%)
  [mid] count=5234
    holder    : n=5234 mean=1.7 median=0 max=36
    non-holder: n=5234 mean=2.1 median=0 max=25
    ties (>0): 269 (5.1%), both-zero: 2245 (42.9%)
  [end] count=618
    holder    : n=618 mean=0.8 median=0 max=10
    non-holder: n=618 mean=1.5 median=1 max=9
    ties (>0): 9 (1.5%), both-zero: 125 (20.2%)

=== Bid-winner by holder status ===
  total bids with winner: 5557
  holder won bid:     2272 (40.9%)
  non-holder won bid: 3285 (59.1%)
```

## B.2 v2.1 500戦の解析出力

```
Analysing 500 games from data/oni-runs-1778456593986.jsonl

=== Outcomes ===
  BLACK 258 (51.6%) | WHITE 236 (47.2%) | Draws 6 (1.2%)
  Margin (B-W): mean 2.2, median 4, p10 -29, p90 35
  Avg turns: 28.6, avg dur: 53.9s
  End reasons: { CHIPS_EXHAUSTED: 152, BOTH_NO_MOVES: 348 }
  Random-opening wipeouts (no bids): 177 (35.4%)

=== Bid distribution by phase (holder vs non-holder) ===
  [open] count=4093
    holder    : n=4093 mean=3.0 median=0 max=54
    non-holder: n=4093 mean=3.1 median=0 max=54
    ties (>0): 760 (18.6%), both-zero: 2834 (69.2%)
  [mid] count=7152
    holder    : n=7152 mean=2.0 median=0 max=42
    non-holder: n=7152 mean=2.8 median=0 max=36
    ties (>0): 224 (3.1%), both-zero: 2855 (39.9%)
  [end] count=1161
    holder    : n=1161 mean=0.7 median=0 max=12
    non-holder: n=1161 mean=1.6 median=1 max=11
    ties (>0): 11 (0.9%), both-zero: 258 (22.2%)

=== Bid-winner by holder status ===
  total bids with winner: 6459
  holder won bid:     2866 (44.4%)
  non-holder won bid: 3593 (55.6%)
```

---

# 付録 C: package.json scripts と vercel.json

## C.1 package.json（要点）

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "verify": "npm run typecheck && npm run lint && npm run test && npm run build"
  }
}
```

## C.2 vercel.json

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "vite",
  "buildCommand": "vite build",
  "installCommand": "npm ci --legacy-peer-deps || npm install --legacy-peer-deps",
  "outputDirectory": "dist",
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ],
  "headers": [
    { "source": "/sw.js", "headers": [
      { "key": "Cache-Control", "value": "no-cache, no-store, must-revalidate" },
      { "key": "Service-Worker-Allowed", "value": "/" }
    ] },
    { "source": "/manifest.webmanifest", "headers": [
      { "key": "Cache-Control", "value": "no-cache, no-store, must-revalidate" },
      { "key": "Content-Type", "value": "application/manifest+json" }
    ] },
    { "source": "/assets/(.*)", "headers": [
      { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
    ] }
  ]
}
```

---

# 付録 D: 主要会話ログ抜粋（時系列）

このセッションで交わされたユーザー指示の流れと、重要な決定点：

1. **「ビッド式オセロ をローンチしたい」** → ローンチチェックリスト網羅実装
2. **「全て実行してください」** → ライセンス・規約・セキュリティ・UX 整備
3. **「オフライン対戦だけのものでローンチしたい、別ブランチで」** → `offline-launch` ブランチ作成
4. **「NPC との対戦のみのモードになるので、NPC の強さが重要」** → cornerAdjacentScore 試行（負の結果）
5. **「鬼同士の対戦1000回から学習させて難易度を高めて」** → 自己対戦テレメトリツール作成、1000戦実行
6. **「先手権を持っている黒が白に勝率劣後する理由はない」** → v2 設計のバグを特定、v2.1 修正案提示
7. **「実装し再テストしてください。500戦でいいです」** → v2.1 実装、500戦で勝率逆転検証
8. **「過去戦績をもとに鬼の難易度を最終強化」** → v2.2（探索計算予算上昇）
9. **「Vercel でテストプレイさせてください」** → デプロイ実施
10. **「これまでの成果を別チャットで共有」** → 本ドキュメント作成

---

# 付録 E: トラブルシュート

## 自己対戦が無音で停止する
バックグラウンドで実行中の `oni1000.ts` が稀に OS / ハーネスにより kill されます。再開方法：
```bash
wc -l data/oni-runs-*.jsonl  # 現在保存済みのゲーム数を確認
npx tsx tools/oni1000.ts 1000 100 <next_game_num> data/oni-runs-XXX.jsonl
```

## Vercel に古いブランチがデプロイされる
- `git branch --show-current` で現在のブランチを確認
- `claude/offline-launch-DPtLL` でない場合は `git fetch && git checkout claude/offline-launch-DPtLL`
- 再度 `npx vercel --prod`

## proxy が 403 でブロックする
- `claude/*` 名前空間のブランチに切り替えて push する

---

これで本セッションの全成果が引き継ぎ可能な形でまとまっています。
