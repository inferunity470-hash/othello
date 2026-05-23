/**
 * Strong search for the 鬼 difficulty:
 *  - Negamax with Principal Variation Search (PVS)
 *  - Transposition table (TT) with always-replace
 *  - Iterative deepening with persistent killers/history
 *  - Aspiration windows around the previous score
 *  - Pre-computed move-ordering scores (TT > corners > killers > countermove > history > flips)
 *  - Internal Iterative Deepening (IID) when no TT move is available
 *  - Countermove heuristic, Futility pruning, Singular extension (Codex T16 / v2.5)
 *  - Optional time budget; depth ceiling for safety
 *  - Exact endgame solve (using TT for transposition reuse) when ≤ EXACT_ENDGAME_EMPTIES empty squares remain
 */

import { Board, Color, opponentOf } from '../types';
import { applyMove, countStones, legalMoves } from '../board';
import { evaluateBoard, mobilityCount } from './eval';
import { hashBoard } from './zobrist';
import { ttBumpGeneration, ttProbe, ttStore, TTFlag } from './tt';

export interface StrongSearchOptions {
  maxDepth: number;
  exactEndgameEmpties: number;
  timeBudgetMs?: number;
}

export interface StrongSearchResult {
  score: number;
  move?: { row: number; col: number };
  depthReached: number;
  nodes: number;
  ttHits: number;
}

const INF = 1e9;
const MATE = 1e7;
// Cap on singular extensions along a single line. Without this, a chain of
// singular first-moves keeps `depth` from decreasing and (with no time
// budget) blows up the tree. 16 is generous for real play — the wall-clock
// guard stops it long before this in time-budgeted searches — and keeps any
// unbudgeted search bounded.
const MAX_SINGULAR_EXTENSIONS = 16;

type Move = { row: number; col: number };

/**
 * Feature flag: Late Move Pruning stage (Codex T13).
 *   0 = disabled (default, v2.3 equivalent)
 *   1 = Stage 1: only extreme late moves (i >= 15, very strict gates)
 *   2 = Stage 2: relaxed (i >= 12) — requires Stage 1 A/B passing first
 */
function readLmpStage(): 0 | 1 | 2 {
  const env =
    typeof process !== 'undefined' && process.env ? process.env.ONI_LMP : undefined;
  if (env === '1') return 1;
  if (env === '2') return 2;
  return 0;
}

/**
 * Feature flag: Countermove heuristic (Codex T16 / A4). Default OFF.
 * It is an ordering-only change, but three independent A/B measurements
 * (oni-vs-oni 8/20; oni-vs-advanced 62.5% ON vs 75% OFF) found no strength
 * gain — consistent with Codex T17's diagnosis that the existing
 * TT/IID/killer ordering already captures most of the available signal.
 * Kept behind ONI_COUNTERMOVE=1 for future investigation; default OFF keeps
 * the production search identical to the proven v2.4 baseline.
 */
function readCountermove(): boolean {
  const env =
    typeof process !== 'undefined' && process.env
      ? process.env.ONI_COUNTERMOVE
      : undefined;
  return env === '1';
}

/**
 * Feature flag: Futility pruning (Codex T16 / B3).
 *   0 = disabled (default, v2.4 equivalent)
 *   1 = depth-1 only
 *   2 = depth 1-2 (relaxed — requires Stage 1 A/B passing first)
 */
function readFutilityStage(): 0 | 1 | 2 {
  const env =
    typeof process !== 'undefined' && process.env
      ? process.env.ONI_FUTILITY
      : undefined;
  if (env === '1') return 1;
  if (env === '2') return 2;
  return 0;
}

/**
 * Feature flag: Singular extension (Codex T16 / B5, conservative "case B").
 * Default off; set ONI_SINGULAR=1 (or 2) to enable. Conservative gating:
 * non-root, non-PV, depth >= 7, TT EXACT only, generous time guard.
 */
function readSingular(): boolean {
  const env =
    typeof process !== 'undefined' && process.env
      ? process.env.ONI_SINGULAR
      : undefined;
  return env === '1' || env === '2';
}

/**
 * Tunable knobs for grid search (Codex T17 P3). Read once at module load;
 * defaults match v2.4 values so default behaviour is unchanged. Override at
 * process launch:
 *   ONI_FUTILITY_MARGIN_D1=500 ONI_LMR_INDEX=8 npx tsx ...
 */
function readEnvNum(name: string, dflt: number): number {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proc = (globalThis as any).process;
  const v = proc?.env?.[name] as string | undefined;
  if (v == null || v === '') return dflt;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : dflt;
}
const FUT_MARGIN_D1 = readEnvNum('ONI_FUTILITY_MARGIN_D1', 350);
const FUT_MARGIN_D2 = readEnvNum('ONI_FUTILITY_MARGIN_D2', 700);
const LMR_INDEX_THRESHOLD = readEnvNum('ONI_LMR_INDEX', 6);
const LMR_DEPTH_THRESHOLD = readEnvNum('ONI_LMR_DEPTH', 4);

interface KillerSet {
  // up to 2 killer moves per ply
  m: Array<Move | null>;
}

let killers: KillerSet[] = [];
// History indexed by destination cell (0..63). A from-cell index doesn't make
// sense for placements, so we use a single 64-slot table — per-cell history.
let history: number[] = [];
// Countermove table (Codex T16 / A4): for each "previous move" cell index,
// the reply that most recently produced a beta cutoff. Cleared once per
// strongSearch (same lifecycle as killers) so repeated searches are fully
// deterministic; persists across the iterative-deepening iterations within
// one search, where the bulk of cutoffs occur.
let countermoves: Array<Move | null> = [];
let nodes = 0;
let ttHits = 0;
let stopAt = Infinity;

function ensurePlyState(maxPlies: number): void {
  if (killers.length < maxPlies + 4) {
    killers = Array.from({ length: maxPlies + 4 }, () => ({ m: [null, null] }));
  } else {
    // Clear killers for a fresh search; we keep the same array shape across searches.
    for (const k of killers) {
      k.m[0] = null;
      k.m[1] = null;
    }
  }
  if (history.length !== 64) {
    history = new Array(64).fill(0);
  }
  // Countermoves are cleared every search (deterministic — a repeated search
  // starts from the same blank table).
  if (countermoves.length !== 64) {
    countermoves = new Array(64).fill(null);
  } else {
    for (let i = 0; i < 64; i++) countermoves[i] = null;
  }
}

function decayHistory(): void {
  for (let i = 0; i < history.length; i++) {
    history[i] = (history[i] / 4) | 0;
  }
}

function moveIndex(m: Move): number {
  return m.row * 8 + m.col;
}

function sameMove(a: Move | null | undefined, b: Move | null | undefined): boolean {
  return a != null && b != null && a.row === b.row && a.col === b.col;
}

function isCorner(r: number, c: number): boolean {
  return (r === 0 || r === 7) && (c === 0 || c === 7);
}

function isXSquare(r: number, c: number): boolean {
  return (r === 1 || r === 6) && (c === 1 || c === 6);
}

function isCSquare(r: number, c: number): boolean {
  return (
    ((r === 0 || r === 7) && (c === 1 || c === 6)) ||
    ((r === 1 || r === 6) && (c === 0 || c === 7))
  );
}

function countEmpty(board: Board): number {
  let n = 0;
  for (const row of board) for (const c of row) if (c === null) n++;
  return n;
}

/**
 * Pre-compute ordering scores once, then sort by descending score using
 * a small selection sort (typical move count is ≤ 12 in mid/endgame).
 * Scores: TT-move > corners > killers > countermove > -opp-mobility-after > history.
 */
function orderMoves(
  moves: Array<Move>,
  board: Board,
  color: Color,
  ttMove: Move | null,
  killerSet: KillerSet,
  counterMove: Move | null
): void {
  if (moves.length <= 1) return;
  const scores = new Array(moves.length);
  const opp = opponentOf(color);
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    let s = 0;
    if (ttMove && ttMove.row === m.row && ttMove.col === m.col) s += 1_000_000;
    if (isCorner(m.row, m.col)) s += 50_000;
    else if (isXSquare(m.row, m.col)) {
      const cr = m.row === 1 ? 0 : 7;
      const cc = m.col === 1 ? 0 : 7;
      if (board[cr][cc] === null) s -= 8000;
    } else if (isCSquare(m.row, m.col)) {
      // C-square is one of (0,1) (0,6) (1,0) (1,7) (6,0) (6,7) (7,1) (7,6).
      // Find the unique adjacent corner: snap each axis to 0 or 7.
      const cr = m.row <= 3 ? 0 : 7;
      const cc = m.col <= 3 ? 0 : 7;
      if (board[cr][cc] === null) s -= 4000;
    }
    if (
      (killerSet.m[0] && killerSet.m[0]!.row === m.row && killerSet.m[0]!.col === m.col) ||
      (killerSet.m[1] && killerSet.m[1]!.row === m.row && killerSet.m[1]!.col === m.col)
    ) {
      s += 9000;
    }
    // Countermove bonus (Codex T16 / A4): placed just below killers — the
    // killer is a same-ply measured cutoff, the countermove is the more
    // general "reply to the opponent's last move". Kept below TT/corner.
    if (counterMove && counterMove.row === m.row && counterMove.col === m.col) {
      s += 7000;
    }
    s += history[moveIndex(m)] | 0;
    // Cheap mobility-after estimate: penalise moves that grant the opponent
    // many replies. Apply only when the move count is small enough that one
    // extra applyMove is worth it (avoids exploding cost in mid-game).
    if (moves.length <= 8) {
      const { newBoard } = applyMove(board, color, m.row, m.col);
      s -= mobilityCount(newBoard, opp) * 30;
    }
    scores[i] = s;
  }
  for (let i = 0; i < moves.length - 1; i++) {
    let best = i;
    for (let j = i + 1; j < moves.length; j++) {
      if (scores[j] > scores[best]) best = j;
    }
    if (best !== i) {
      const tm = moves[i];
      moves[i] = moves[best];
      moves[best] = tm;
      const ts = scores[i];
      scores[i] = scores[best];
      scores[best] = ts;
    }
  }
}

/**
 * Exact endgame solver with α-β + TT. Returns score from `color`'s POV.
 * When both sides have passed, returns the exact stone difference × 1000.
 */
function exactEndgame(
  board: Board,
  color: Color,
  alpha: number,
  beta: number,
  passed: boolean,
  ply: number
): number {
  nodes++;
  if (Date.now() > stopAt) return evaluateBoard(board, color);

  // Use TT — reusing across deep transpositions is the single biggest win.
  // For exact-endgame nodes we pretend depth = number of empties; TT entries
  // from earlier in the solve cover the same sub-tree exactly.
  const empty = countEmpty(board);
  const key = hashBoard(board, color);
  const tt = ttProbe(key);
  let ttMove: Move | null = null;
  if (tt) {
    ttHits++;
    if (tt.bestRow >= 0) ttMove = { row: tt.bestRow, col: tt.bestCol };
    if (tt.depth >= empty) {
      if (tt.flag === 'EXACT') return tt.score;
      if (tt.flag === 'LOWER' && tt.score >= beta) return tt.score;
      if (tt.flag === 'UPPER' && tt.score <= alpha) return tt.score;
    }
  }

  const moves = legalMoves(board, color);
  if (moves.length === 0) {
    if (passed) {
      const { BLACK, WHITE } = countStones(board);
      const mine = color === 'BLACK' ? BLACK : WHITE;
      const theirs = color === 'BLACK' ? WHITE : BLACK;
      return (mine - theirs) * 1000;
    }
    return -exactEndgame(board, opponentOf(color), -beta, -alpha, true, ply + 1);
  }

  // Cheap ordering: TT move first, then corners
  if (moves.length > 1) {
    moves.sort((a, b) => {
      const aTT = ttMove && ttMove.row === a.row && ttMove.col === a.col ? 1 : 0;
      const bTT = ttMove && ttMove.row === b.row && ttMove.col === b.col ? 1 : 0;
      if (aTT !== bTT) return bTT - aTT;
      const aCorner = isCorner(a.row, a.col) ? 1 : 0;
      const bCorner = isCorner(b.row, b.col) ? 1 : 0;
      return bCorner - aCorner;
    });
  }

  const origAlpha = alpha;
  let best = -INF;
  let bestMove: Move | undefined = undefined;
  for (const m of moves) {
    const { newBoard } = applyMove(board, color, m.row, m.col);
    const score = -exactEndgame(
      newBoard,
      opponentOf(color),
      -beta,
      -alpha,
      false,
      ply + 1
    );
    if (score > best) {
      best = score;
      bestMove = m;
    }
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }

  const flag: TTFlag = best <= origAlpha ? 'UPPER' : best >= beta ? 'LOWER' : 'EXACT';
  ttStore(key, empty, best, flag, bestMove?.row ?? -1, bestMove?.col ?? -1);
  return best;
}

/**
 * Negamax with PVS and TT. Score is from `color`'s POV.
 *
 * `prevMove` — the opponent's move that led to this node (Codex T16 / A4,
 *   countermove heuristic). null at the root / after the random opening.
 * `excludedMove` — when set, this move is skipped and TT cut/store are
 *   disabled. Used only by the singular-extension verification search
 *   (Codex T16 / B5) so the result reflects "all moves except the TT move".
 * `numExtensions` — singular extensions used so far on this line; capped by
 *   MAX_SINGULAR_EXTENSIONS so a chain of extensions cannot run away.
 */
function pvs(
  board: Board,
  color: Color,
  depth: number,
  alpha: number,
  beta: number,
  passed: boolean,
  ply: number,
  prevMove: Move | null,
  excludedMove: Move | null,
  numExtensions: number
): { score: number; move?: Move } {
  nodes++;
  if (Date.now() > stopAt) return { score: evaluateBoard(board, color) };

  const key = hashBoard(board, color);
  const tt = ttProbe(key);
  let ttMove: Move | null = null;
  if (tt) {
    ttHits++;
    if (tt.bestRow >= 0) ttMove = { row: tt.bestRow, col: tt.bestCol };
    // H9: at root (ply === 0) require a usable TT move before short-circuiting,
    // otherwise the caller falls back to pickGreedyMove and the 鬼 looks weaker
    // than its evaluation suggests.
    // The TT cut is disabled inside a singular-verification search: the stored
    // entry was computed *including* the excluded move, so its bound is invalid
    // for the "all other moves" question we are now asking.
    const canCut = (ply > 0 || ttMove !== null) && excludedMove === null;
    if (canCut && tt.depth >= depth) {
      if (tt.flag === 'EXACT') return { score: tt.score, move: ttMove ?? undefined };
      if (tt.flag === 'LOWER' && tt.score >= beta)
        return { score: tt.score, move: ttMove ?? undefined };
      if (tt.flag === 'UPPER' && tt.score <= alpha)
        return { score: tt.score, move: ttMove ?? undefined };
    }
  }

  if (depth === 0) {
    return { score: evaluateBoard(board, color) };
  }

  const moves = legalMoves(board, color);
  if (moves.length === 0) {
    if (passed) {
      const { BLACK, WHITE } = countStones(board);
      const mine = color === 'BLACK' ? BLACK : WHITE;
      const theirs = color === 'BLACK' ? WHITE : BLACK;
      return { score: (mine - theirs) * 1000 };
    }
    // A pass does not change the last placed stone, so prevMove carries over.
    const r = pvs(
      board,
      opponentOf(color),
      depth - 1,
      -beta,
      -alpha,
      true,
      ply + 1,
      prevMove,
      null,
      numExtensions
    );
    return { score: -r.score };
  }

  const killerSet = killers[ply] ?? { m: [null, null] };

  // Internal Iterative Deepening (IID): when no TT move is available and the
  // remaining depth is large enough, do a shallow search to get a likely-good
  // first move for ordering. PVS is highly sensitive to first-move quality;
  // even a depth-2 reduction here is worth the cost on deep iterations.
  // Skipped inside a singular-verification search (excludedMove !== null).
  if (
    ttMove === null &&
    excludedMove === null &&
    depth >= 5 &&
    Date.now() < stopAt
  ) {
    const iid = pvs(
      board,
      color,
      depth - 2,
      alpha,
      beta,
      passed,
      ply,
      prevMove,
      null,
      numExtensions
    );
    if (iid.move) ttMove = iid.move;
  }

  // Countermove for this node: the reply previously recorded against the
  // opponent's last move. Only consulted when the flag is on.
  const counterMove: Move | null =
    readCountermove() && prevMove ? countermoves[moveIndex(prevMove)] : null;

  orderMoves(moves, board, color, ttMove, killerSet, counterMove);

  const origAlpha = alpha;
  let best = -INF;
  let bestMove: Move | undefined = undefined;
  let firstMove = true;

  const isPvNode = beta > alpha + 1;

  // Singular extension check (Codex T16 / B5, conservative case B). When the
  // TT move looks much stronger than every alternative, search it one ply
  // deeper. Heavily gated: non-root, non-PV, depth >= 7, a trustworthy EXACT
  // TT entry, and a generous time guard so it never starves the budget.
  let singularExtend = false;
  if (
    readSingular() &&
    excludedMove === null &&
    ttMove !== null &&
    tt !== null &&
    tt.flag === 'EXACT' &&
    tt.depth >= depth - 2 &&
    depth >= 7 &&
    ply > 0 &&
    !isPvNode &&
    numExtensions < MAX_SINGULAR_EXTENSIONS &&
    stopAt - Date.now() > 150
  ) {
    const margin = 120 + depth * 20;
    const singularBeta = tt.score - margin;
    const verify = pvs(
      board,
      color,
      depth - 3,
      singularBeta - 1,
      singularBeta,
      passed,
      ply,
      prevMove,
      ttMove,
      numExtensions
    );
    // Every move except the TT move fell short of tt.score - margin → the TT
    // move is singular and worth an extra ply.
    if (verify.score < singularBeta) singularExtend = true;
  }

  // LMP gate state. The cheap parts are evaluated up front; the expensive
  // countEmpty(board) call is deferred until we actually need it (i.e. only
  // when LMP could even fire for this node). This keeps the default-off path
  // free of per-node overhead so v2.3 strength is preserved.
  const lmpStage = readLmpStage();
  const lmpEligibleByDepth =
    lmpStage > 0 && depth === 1 && ply > 0 && !isPvNode;

  // Futility pruning gate (Codex T16 / B3). Shallow non-PV nodes only.
  const futilityStage = readFutilityStage();
  const futilityActive =
    futilityStage > 0 &&
    ply > 0 &&
    !isPvNode &&
    excludedMove === null &&
    (depth === 1 || (futilityStage === 2 && depth === 2));

  // The board empty-count is shared between LMP and futility (both depth-1
  // gated). Compute it at most once, and only when a gate could use it.
  const needEmpty = lmpEligibleByDepth || futilityActive;
  const boardEmpty = needEmpty ? countEmpty(board) : -1;

  const lmpEligibleNode =
    lmpEligibleByDepth && boardEmpty >= (lmpStage === 1 ? 24 : 28);
  const stage1IndexThreshold = 15;
  const stage2IndexThreshold = 12;
  const stage1MovesThreshold = 16;
  const stage2MovesThreshold = 14;

  // Lazy per-node static evaluation, reused by futility across all moves.
  let staticEval: number | null = null;
  const getStaticEval = (): number => {
    if (staticEval === null) staticEval = evaluateBoard(board, color);
    return staticEval;
  };

  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];

    // Singular-verification search: skip the move being tested for singularity.
    if (excludedMove !== null && sameMove(m, excludedMove)) continue;

    const isTactical =
      isCorner(m.row, m.col) ||
      sameMove(ttMove, m) ||
      sameMove(killerSet.m[0], m) ||
      sameMove(killerSet.m[1], m) ||
      sameMove(counterMove, m);

    // Late Move Pruning (Codex T13 safe redo). Heavily gated:
    // - feature flag enabled (default off)
    // - depth = 1, not at root, non-PV null-window
    // - empties >= 24 (Stage 1) or >= 28 (Stage 2) — never near exact endgame
    // - already raised alpha (Stage 2 requires alpha >= origAlpha + 100)
    // - moves[i] is not tactical (corner, TT, killer, countermove)
    if (
      lmpEligibleNode &&
      !firstMove &&
      bestMove !== undefined &&
      alpha > origAlpha &&
      (lmpStage === 1
        ? i >= stage1IndexThreshold && moves.length >= stage1MovesThreshold
        : i >= stage2IndexThreshold &&
          moves.length >= stage2MovesThreshold &&
          alpha >= origAlpha + 100)
    ) {
      if (!isTactical) continue;
    }

    // Futility pruning (Codex T16 / B3). Skip a late quiet move at a shallow
    // non-PV node when even a generous margin on the static eval cannot reach
    // alpha. Never the first move, never tactical (corner/TT/killer/
    // countermove), and never near the exact-endgame boundary.
    if (
      futilityActive &&
      !firstMove &&
      bestMove !== undefined &&
      boardEmpty > 18 &&
      !isTactical
    ) {
      const margin = depth === 1 ? FUT_MARGIN_D1 : FUT_MARGIN_D2;
      if (getStaticEval() + margin <= alpha) continue;
    }

    const { newBoard } = applyMove(board, color, m.row, m.col);
    let score: number;

    // Late-move reductions (LMR): for non-PV moves at sufficient depth,
    // reduce by 1 ply unless the move is a corner (high-value), a TT
    // suggestion, or a killer. Conservative thresholds (depth ≥ 4, i ≥ 6)
    // to avoid pruning critical lines.
    let reduce = 0;
    if (!firstMove && depth >= LMR_DEPTH_THRESHOLD && i >= LMR_INDEX_THRESHOLD) {
      const isHigh =
        isCorner(m.row, m.col) ||
        sameMove(ttMove, m) ||
        sameMove(killerSet.m[0], m);
      if (!isHigh) reduce = 1;
    }

    if (firstMove) {
      // Singular extension applies to the TT move, which orderMoves places
      // first. Extend it by one ply when the verification search confirmed
      // it stands alone.
      const ext = singularExtend && sameMove(m, ttMove) ? 1 : 0;
      score = -pvs(
        newBoard,
        opponentOf(color),
        depth - 1 + ext,
        -beta,
        -alpha,
        false,
        ply + 1,
        m,
        null,
        numExtensions + ext
      ).score;
      firstMove = false;
    } else {
      // Null-window probe (with optional reduction)
      score = -pvs(
        newBoard,
        opponentOf(color),
        depth - 1 - reduce,
        -alpha - 1,
        -alpha,
        false,
        ply + 1,
        m,
        null,
        numExtensions
      ).score;
      if (reduce > 0 && score > alpha) {
        // Re-search without reduction at full window
        score = -pvs(
          newBoard,
          opponentOf(color),
          depth - 1,
          -alpha - 1,
          -alpha,
          false,
          ply + 1,
          m,
          null,
          numExtensions
        ).score;
      }
      if (score > alpha && score < beta) {
        // Re-search with full window
        score = -pvs(
          newBoard,
          opponentOf(color),
          depth - 1,
          -beta,
          -alpha,
          false,
          ply + 1,
          m,
          null,
          numExtensions
        ).score;
      }
    }
    if (score > best) {
      best = score;
      bestMove = m;
    }
    if (best > alpha) alpha = best;
    if (alpha >= beta) {
      if (
        !(killerSet.m[0] && killerSet.m[0]!.row === m.row && killerSet.m[0]!.col === m.col)
      ) {
        killerSet.m[1] = killerSet.m[0];
        killerSet.m[0] = m;
        killers[ply] = killerSet;
      }
      const idx = moveIndex(m);
      // History saturation: cap to avoid any single cell dominating the
      // ordering signal across many iterations. The decay every iteration
      // (decayHistory) already mitigates drift; clamping additionally prevents
      // overflow on long-running searches.
      const MAX_HISTORY = 1 << 20;
      const next = (history[idx] | 0) + depth * depth;
      history[idx] = next > MAX_HISTORY ? MAX_HISTORY : next;
      // Countermove update (Codex T16 / A4): record the reply that produced
      // this cutoff against the opponent's previous move.
      if (prevMove !== null) {
        countermoves[moveIndex(prevMove)] = m;
      }
      break;
    }
  }

  const flag: TTFlag = best <= origAlpha ? 'UPPER' : best >= beta ? 'LOWER' : 'EXACT';
  // A singular-verification search has not examined the excluded move, so its
  // bound is only valid for the restricted move set — never pollute the TT
  // with it.
  if (excludedMove === null) {
    ttStore(key, depth, best, flag, bestMove?.row ?? -1, bestMove?.col ?? -1);
  }

  return { score: best, move: bestMove };
}

/**
 * Iterative-deepening driver with aspiration windows around the previous
 * iteration's score.
 */
export function strongSearch(
  board: Board,
  color: Color,
  options: StrongSearchOptions
): StrongSearchResult {
  nodes = 0;
  ttHits = 0;
  ttBumpGeneration();
  ensurePlyState(64);
  // History decay between searches (preserve learning, but don't let
  // ancient values dominate fresh dynamics).
  decayHistory();
  const start = Date.now();
  stopAt = options.timeBudgetMs ? start + options.timeBudgetMs : Infinity;

  const empty = countEmpty(board);

  // Exact endgame solve
  if (empty <= options.exactEndgameEmpties) {
    const moves = legalMoves(board, color);
    if (moves.length === 0) {
      const score = exactEndgame(board, color, -INF, INF, false, 0);
      return { score, depthReached: empty, nodes, ttHits };
    }
    let bestM: Move | undefined = undefined;
    let bestScore = -INF;
    let alpha = -INF;
    const beta = INF;
    // Order roots: TT-move first if any, else corners
    const rootKey = hashBoard(board, color);
    const rootTT = ttProbe(rootKey);
    const ttMove =
      rootTT && rootTT.bestRow >= 0
        ? { row: rootTT.bestRow, col: rootTT.bestCol }
        : null;
    moves.sort((a, b) => {
      const aTT = ttMove && ttMove.row === a.row && ttMove.col === a.col ? 1 : 0;
      const bTT = ttMove && ttMove.row === b.row && ttMove.col === b.col ? 1 : 0;
      if (aTT !== bTT) return bTT - aTT;
      const aCorner = isCorner(a.row, a.col) ? 1 : 0;
      const bCorner = isCorner(b.row, b.col) ? 1 : 0;
      return bCorner - aCorner;
    });
    for (const m of moves) {
      const { newBoard } = applyMove(board, color, m.row, m.col);
      const s = -exactEndgame(newBoard, opponentOf(color), -beta, -alpha, false, 1);
      if (s > bestScore) {
        bestScore = s;
        bestM = m;
        if (s > alpha) alpha = s;
      }
    }
    return { score: bestScore, move: bestM, depthReached: empty, nodes, ttHits };
  }

  // Iterative deepening with aspiration windows
  let result: { score: number; move?: Move } = { score: 0 };
  let depthReached = 0;
  let prev: number | null = null;
  for (let d = 1; d <= options.maxDepth; d++) {
    if (Date.now() > stopAt) break;
    let alpha: number;
    let beta: number;
    if (d <= 3 || prev == null) {
      alpha = -INF;
      beta = INF;
    } else {
      // Aspiration window — tighter for stable mid/endgame positions
      // (where PVS already amortises most of the cost) and wider in
      // wild opening-to-midgame transitions.
      const window = d <= 6 ? 60 : 35;
      alpha = prev - window;
      beta = prev + window;
    }
    let r = pvs(board, color, d, alpha, beta, false, 0, null, null, 0);
    // If the search was interrupted by the time budget, the returned
    // score is contaminated by short-circuited evaluateBoard calls
    // inside pvs — keep the previous (last-completed) iteration's
    // result rather than accepting bogus values.
    if (Date.now() > stopAt) break;
    // Aspiration miss: re-search with a widened window (grown
    // exponentially in case the eval is genuinely volatile).
    // H12: cap the retry count to bound time spent on MATE-level scores,
    // and fall back to a full-window search if the retries are exhausted.
    const MAX_ASPIRATION_RETRIES = 4;
    let widen = 60;
    let retries = 0;
    while (
      (r.score <= alpha || r.score >= beta) &&
      Date.now() < stopAt &&
      retries < MAX_ASPIRATION_RETRIES
    ) {
      if (r.score <= alpha) alpha -= widen;
      else if (r.score >= beta) beta += widen;
      widen *= 4;
      // Clamp to ±INF
      if (alpha < -INF) alpha = -INF;
      if (beta > INF) beta = INF;
      r = pvs(board, color, d, alpha, beta, false, 0, null, null, 0);
      retries++;
      if (alpha === -INF && beta === INF) break;
    }
    // If retries were exhausted and we still missed, do a single
    // full-window search rather than accepting an unconverged score.
    if (
      (r.score <= alpha || r.score >= beta) &&
      Date.now() < stopAt &&
      (alpha !== -INF || beta !== INF)
    ) {
      r = pvs(board, color, d, -INF, INF, false, 0, null, null, 0);
    }
    // If we ran out of time during the (possibly-widened) re-search,
    // discard this iteration's result and keep the previous one.
    if (Date.now() > stopAt) break;
    result = r;
    depthReached = d;
    prev = r.score;
    if (Math.abs(r.score) > MATE / 2) break;
  }
  return {
    score: result.score,
    move: result.move,
    depthReached,
    nodes,
    ttHits,
  };
}
