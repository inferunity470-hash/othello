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
function readBidEnvNum(name: string, dflt: number): number {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proc = (globalThis as any).process;
  const v = proc?.env?.[name] as string | undefined;
  if (v == null || v === '') return dflt;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : dflt;
}

// Codex T17 bid curve infrastructure (default = v2.4 legacy values).
// Module-load constants — set env at process launch for A/B grid search:
//   ONI_TOKEN_COST=10 ONI_BID_SCALE=1000 npx tsx ...
const TOKEN_COST = readBidEnvNum('ONI_TOKEN_COST', 6);
const BID_SCALE = readBidEnvNum('ONI_BID_SCALE', 800);
const BID_CAP = readBidEnvNum('ONI_BID_CAP', 0.85);
const BID_FIRST_SHADE = readBidEnvNum('ONI_BID_FIRST_SHADE', 0.6);
const BID_VICKREY_SHADE = readBidEnvNum('ONI_BID_VICKREY_SHADE', 0.92);
const BID_ALLPAY_SHADE = readBidEnvNum('ONI_BID_ALLPAY_SHADE', 0.85);

/**
 * Feature flag: Fear Factor (Codex T11). When the opponent suddenly bids
 * a value materially above their recent baseline, the oni shades its own
 * bid down — except in critical positions where the floor protects the
 * tactical value. Default off; set ONI_FEAR_FACTOR=1 to enable.
 */
function readFearFactor(): number {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proc = (globalThis as any).process;
  if (!proc || !proc.env) return 0;
  const v = proc.env.ONI_FEAR_FACTOR as string | undefined;
  if (v === undefined || v === '') return 0;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Returns a fear score in [0, 1] indicating how strongly the opponent's
 * latest bid signals an escalation relative to their recent baseline.
 * Returns 0 when there is not enough history (no shading on early turns).
 */
function opponentFearScore(state: GameState, oppColor: Color): number {
  const history = state.history;
  if (!history || history.length < 4) return 0;
  const FEAR_WINDOW = 5;
  // Walk back collecting recent opponent bids (skip turns without a bid).
  const recent: number[] = [];
  for (let i = history.length - 1; i >= 0 && recent.length < FEAR_WINDOW + 1; i--) {
    const t = history[i];
    if (t.bids && typeof t.bids[oppColor] === 'number') {
      recent.push(t.bids[oppColor] as number);
    }
  }
  if (recent.length < 4) return 0;
  // recent[0] is the latest opponent bid; the rest is the baseline.
  const last = recent[0];
  const baseline = recent.slice(1);
  const mean = baseline.reduce((a, b) => a + b, 0) / baseline.length;
  const max = Math.max(...baseline);
  if (last < 2) return 0;
  // Strong escalation: clearly above both the recent mean and max.
  if (last >= mean * 1.8 && last >= max + 5) return 1.0;
  if (last >= mean * 1.5 && last >= max + 2) return 0.6;
  if (last >= mean * 1.25) return 0.3;
  return 0;
}

function applyFearFactorToOniBid(
  state: GameState,
  color: Color,
  bid: number,
  defenseBid: number,
  cap: number
): number {
  const intensity = readFearFactor();
  if (intensity <= 0) return bid;
  const fearScore = opponentFearScore(state, opponentOf(color));
  if (fearScore <= 0) return bid;
  const auctionType = state.options.auctionType;
  // Intensity multipliers per auction type (Codex T11 §3).
  const typeMul =
    auctionType === 'all-pay'
      ? 0.26
      : auctionType === 'second-price'
        ? 0.10
        : 0.18;
  const maxReduction =
    auctionType === 'all-pay'
      ? 0.35
      : auctionType === 'second-price'
        ? 0.16
        : 0.25;
  const reduction = Math.min(maxReduction, intensity * typeMul * fearScore);
  let next = bid * (1 - reduction);
  // Floor: never drop below the defense bid (critical-position protection)
  // nor below the minimum legal bid.
  const minBid = currentMinBid(state);
  next = Math.max(next, defenseBid, minBid);
  next = Math.min(next, cap);
  return Math.round(next);
}

function deltaValueOfMoving(
  state: GameState,
  color: Color,
  depth: number,
  useStrong = false,
  timeBudgetMs?: number,
  exactEndgameEmpties = 0
): { delta: number; myBest: number; oppBest: number } {
  const opp = opponentOf(color);
  let myScore: number;
  let oppScore: number;
  if (useStrong) {
    // H10: split the time budget between the two strongSearch calls so the
    // second side cannot starve. If either side reaches depth 0 (no completed
    // iteration), fall back to a bounded synchronous alphabeta to keep delta
    // meaningful instead of returning arbitrary partial scores.
    const half =
      timeBudgetMs == null ? undefined : Math.max(1, Math.floor(timeBudgetMs / 2));
    // Codex T17 P1: the bid forecast can solve the endgame exactly, just like
    // the move search does — `exactEndgameEmpties` (default 0 = legacy) is the
    // empties threshold below which strongSearch runs the exact solver.
    const me = strongSearch(state.board, color, {
      maxDepth: depth,
      exactEndgameEmpties,
      timeBudgetMs: half,
    });
    const them = strongSearch(state.board, opp, {
      maxDepth: depth,
      exactEndgameEmpties,
      timeBudgetMs: half,
    });
    if (me.depthReached === 0 || them.depthReached === 0) {
      // Fallback: shallow deterministic comparison rather than partial scores.
      const fallbackDepth = Math.min(3, depth);
      const myBest = alphabeta(state.board, color, fallbackDepth, -Infinity, Infinity, color);
      const oppBest = alphabeta(state.board, opp, fallbackDepth, -Infinity, Infinity, color);
      return {
        delta: myBest.score - oppBest.score,
        myBest: myBest.score,
        oppBest: oppBest.score,
      };
    }
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
  // Codex T17 P3+: per-phase budget / depth / exact-endgame thresholds are
  // env-configurable for time-budget A/B grid search (defaults = v2.4 values).
  if (empties <= 10) {
    maxDepth = readBidEnvNum('ONI_DEPTH_LE10', 22);
    exactEndgameEmpties = empties;
    timeBudgetMs = readBidEnvNum('ONI_BUDGET_LE10', 4500);
  } else if (empties <= 18) {
    maxDepth = readBidEnvNum('ONI_DEPTH_LE18', 20);
    exactEndgameEmpties = empties;
    timeBudgetMs = readBidEnvNum('ONI_BUDGET_LE18', 3500);
  } else if (empties <= 22) {
    maxDepth = readBidEnvNum('ONI_DEPTH_LE22', 14);
    exactEndgameEmpties = 0;
    timeBudgetMs = readBidEnvNum('ONI_BUDGET_LE22', 2200);
  } else {
    maxDepth = readBidEnvNum('ONI_DEPTH_DEFAULT', 11);
    exactEndgameEmpties = 0;
    timeBudgetMs = readBidEnvNum('ONI_BUDGET_DEFAULT', 1400);
  }
  // Global time-budget scale (ONI_TIME_SCALE) — used to run fast self-play
  // for A/B screening. Default 1.0 leaves the budgets above unchanged.
  timeBudgetMs = Math.max(50, Math.round(timeBudgetMs * readTimeScale()));
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
  const decisiveCap = chips * BID_CAP;
  return decisiveCap * (1 - Math.exp(-value / BID_SCALE));
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
type OppBidStrategy = 'aggressive' | 'conservative' | 'panic';

function recentOpponentBids(state: GameState, oppColor: Color, n = 10): number[] {
  return state.history
    .filter(t => t.bids != null)
    .slice(-n)
    .map(t => ((t.bids![oppColor] as number) ?? 0));
}

function percentile(xs: number[], p: number): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.floor((s.length - 1) * p));
  return s[i];
}

/**
 * Classify the opponent's recent bidding style. Drives the realistic
 * max-bid estimate and the oni's chip-conservation choices in decideBid.
 * See codex-review-T15-general-strategy-detection.md for the full
 * derivation; in short:
 *   - aggressive: standard play, no detectable pattern
 *   - conservative: 0 連投 (T14), 50/0/50/0 交互 (T15), or any sparse-spend
 *     pattern where the opponent saves chips for the tieBreaker
 *   - panic: 20/40/60/80 escalation, all-in pressure, or a recent spike
 */
function detectOpponentBidStrategy(
  state: GameState,
  oppColor: Color,
  oppChips: number
): OppBidStrategy {
  const bids = recentOpponentBids(state, oppColor, 10);
  if (bids.length < 3) return 'aggressive';

  const median = percentile(bids, 0.5);
  const avg = bids.reduce((a, b) => a + b, 0) / bids.length;
  const zeroRate = bids.filter(b => b === 0).length / bids.length;
  const maxBid = Math.max(...bids);
  const last = bids[bids.length - 1];

  const lowMedian = median <= oppChips * 0.05;
  const variance =
    bids.reduce((a, b) => a + (b - avg) ** 2, 0) / bids.length;
  const highVariance = variance > avg * avg;

  // Rising pattern (escalation): must be checked before "conservative" so
  // that 0/20/40/60/80 stays in panic and not in conservative. Guard
  // against oppChips=0 so that "0 >= 0*0.5" doesn't trigger a false panic.
  const rising =
    bids.length >= 4 &&
    bids.slice(-4).every((b, i, a) => i === 0 || b > a[i - 1]);
  if (
    rising ||
    (oppChips > 0 && last >= oppChips * 0.5) ||
    (oppChips > 0 && maxBid >= oppChips * 0.4 && median >= oppChips * 0.15)
  ) {
    return 'panic';
  }

  // T14 (0/0/0/0/0), T15 (50/0/50/0/50), and any future sparse-spend pattern.
  if (
    zeroRate >= 0.5 ||
    (zeroRate >= 0.4 && highVariance) ||
    lowMedian
  ) {
    return 'conservative';
  }

  return 'aggressive';
}

function estimateOppMaxBid(
  state: GameState,
  oppColor: Color,
  oppChips: number
): number {
  const bids = recentOpponentBids(state, oppColor, 10);
  if (bids.length === 0) return oppChips;
  const median = percentile(bids, 0.5);
  const p75 = percentile(bids, 0.75);
  const maxBid = Math.max(...bids);
  const strategy = detectOpponentBidStrategy(state, oppColor, oppChips);

  let estimate: number;
  if (strategy === 'conservative') {
    // 50/0/50/0/50 → median 50, p75 50. We do NOT want to chase a 100;
    // the opponent only matches 50% of the time. Anchor low.
    estimate = Math.max(median * 2, p75 * 1.25, oppChips * 0.05);
  } else if (strategy === 'panic') {
    // Escalation / all-in pressure: prepare for the next spike.
    estimate = Math.max(maxBid * 1.25, p75 * 2, oppChips * 0.35);
  } else {
    estimate = Math.max(median * 2, p75 * 1.5, oppChips * 0.15);
  }
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
  // Codex T17 P1: bid forecast can solve the endgame exactly (ONI_BID_EXACT)
  // and use a tunable budget (ONI_BID_BUDGET). Defaults preserve legacy.
  const { delta, oppBest } = deltaValueOfMoving(
    state,
    color,
    depth,
    true,
    readBidBudget(),
    readBidExactEmpties()
  );
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
      BID_ALLPAY_SHADE,
      useV2 ? isHolderForTiebreak : false
    );
  } else if (adjusted > 0) {
    const valueChips = evalPointsToChips(adjusted, chips);
    // Shading factor by auction type:
    //  - first-price: ~60% (placement-driven token rule gives a small
    //    extra value to winning when we're not the holder)
    //  - Vickrey:     ~92% (close to truthful but reserve tiny margin)
    const shade = isVickrey ? BID_VICKREY_SHADE : BID_FIRST_SHADE;
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

  // Chip-conservation counter (codex-review-T15, supersedes T14):
  // classify the opponent's bidding style and drop our own bid to the
  // minimum when they are a conservative chip-saver (covers 0連投,
  // 50/0/50/0, and any future sparse-spend pattern). The defenseBid
  // floor still protects critical tactical positions; in genuinely
  // critical spots the oni will spend, in non-critical spots it will
  // stop bleeding chips on hollow auctions.
  const oppStrategy = detectOpponentBidStrategy(
    state,
    opponentOf(color),
    oppChips
  );
  if (oppStrategy === 'conservative') {
    const minCounter = isHolder ? 0 : 1;
    bid = Math.max(minCounter, defenseBid);
  }

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
  // Fear factor (default off; ONI_FEAR_FACTOR=1 to enable). Applied after
  // defenseBid is folded in and before the final cap/clamp so the floor
  // remains the tactical minimum.
  bid = applyFearFactorToOniBid(state, color, bid, defenseBid, cap);
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

/**
 * Codex T17 P1: empties threshold below which the oni's bid forecast solves
 * the endgame exactly (passed as `exactEndgameEmpties` to strongSearch).
 * 0 = legacy (approximate forecast even in the endgame). Tunable via
 * ONI_BID_EXACT for A/B grid search.
 */
function readBidExactEmpties(): number {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proc = (globalThis as any).process;
  const v = proc?.env?.ONI_BID_EXACT as string | undefined;
  if (v == null || v === '') return 0;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/**
 * Global multiplier on every oni time budget (move search + bid forecast).
 * Default 1.0. Set ONI_TIME_SCALE=0.25 etc. to run much faster self-play
 * games for A/B screening (confirm winners at full time afterwards).
 */
function readTimeScale(): number {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proc = (globalThis as any).process;
  const v = proc?.env?.ONI_TIME_SCALE as string | undefined;
  if (v == null || v === '') return 1;
  const n = parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/**
 * Time budget (ms) for the oni's bid forecast (split across the two
 * strongSearch calls in deltaValueOfMoving). Default 900, scaled by
 * ONI_TIME_SCALE. Tunable via ONI_BID_BUDGET for A/B grid search.
 */
function readBidBudget(): number {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proc = (globalThis as any).process;
  const v = proc?.env?.ONI_BID_BUDGET as string | undefined;
  let budget = 900;
  if (v != null && v !== '') {
    const n = parseInt(v, 10);
    if (Number.isFinite(n) && n > 0) budget = n;
  }
  return Math.max(50, Math.round(budget * readTimeScale()));
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
