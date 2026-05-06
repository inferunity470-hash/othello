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
 * losing the initiative token. Under the placement-driven rule, the holder
 * loses the token whenever they place a stone, so the AI should be slightly
 * less eager to win bids when it currently holds the token.
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
  // Endgame: solve exactly when ≤ 16 empties (TT-cached endgame solver
  // makes 16-empty solves feasible; 2 plies more exact play than the
  // previous ≤14 trigger).
  // Midgame: deep PVS with TT + iterative deepening + aspiration
  // windows. Time budgets bound each move for UI snappiness; iterative
  // deepening returns the last completed iteration's move.
  let maxDepth: number;
  let exactEndgameEmpties: number;
  let timeBudgetMs: number | undefined;
  if (empties <= 10) {
    maxDepth = 22;
    exactEndgameEmpties = empties;
    timeBudgetMs = 3000;
  } else if (empties <= 16) {
    maxDepth = 18;
    exactEndgameEmpties = empties;
    timeBudgetMs = 2500;
  } else if (empties <= 22) {
    maxDepth = 12;
    exactEndgameEmpties = 0;
    timeBudgetMs = 1500;
  } else {
    maxDepth = 10;
    exactEndgameEmpties = 0;
    timeBudgetMs = 1000;
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
  shade: number
): number {
  if (adjusted <= 0) return 0;
  const valueChips = evalPointsToChips(adjusted, chips);
  const target = Math.floor(valueChips * shade);
  const oppMaxModel = estimateOppMaxBid(state, opponentOf(color), oppChips);
  // Cheap-win path: if opp's modelled max is well below our shaded
  // target, bid just above it instead of over-paying.
  const minToWin = oppMaxModel + 3;
  const cheap = minToWin < target ? minToWin : target;
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
  // Bid evaluation is a *forecast* of the upcoming move's value. Depth 8-10
  // matches the depth pickOniMove will use; budget bounds it to ~600ms.
  const depth = empties <= 14 ? 10 : empties <= 22 ? 9 : 8;
  const { delta, oppBest } = deltaValueOfMoving(state, color, depth, true, 700);
  const adjusted = isHolder ? delta - TOKEN_COST : delta;

  // Sparse-board (early opening) base: bid higher to avoid the
  // opponent matching us at the base and stealing T1 via tie-as-holder.
  const sparse = empties >= 50;
  const baseBid = sparse
    ? Math.max(3, Math.floor(chips * 0.16) + 1)
    : Math.max(3, Math.floor(chips * 0.1));

  let bid = baseBid;

  // Endgame chip-banking: when fewer empties remain than estimated bids,
  // it's safe to spend. When many remain, conserve.
  // Estimated remaining bidding turns ≈ empties / 2.
  const estimatedRemainingBids = Math.max(1, Math.ceil(empties / 2));
  const conservation =
    estimatedRemainingBids >= 12 ? 0.85 : estimatedRemainingBids >= 6 ? 0.95 : 1.0;

  if (isAllPay) {
    // All-pay strategy for oni: shade 0.85 of value (high confidence
    // from deep search) but cheap-win against weak bidders via the
    // history model. Critical positions are bumped further by the
    // tieredDefenseBid call below.
    bid = allPayBid(state, color, adjusted, chips, oppChips, baseBid, 0.85);
  } else if (adjusted > 0) {
    const valueChips = evalPointsToChips(adjusted, chips);
    // Shading factor by auction type:
    //  - first-price: ~60% (placement-driven token rule gives a small
    //    extra value to winning when we're not the holder)
    //  - Vickrey:     ~92% (close to truthful but reserve tiny margin)
    const shade = isVickrey ? 0.92 : 0.6;
    const target = Math.floor(valueChips * shade * conservation);
    bid = Math.max(bid, target + 2);
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

  const cap = Math.max(1, Math.floor(chips * 0.92));
  return clampBid(Math.min(bid, cap), state, color);
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
