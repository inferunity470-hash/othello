/**
 * Strong search for the 鬼 difficulty:
 *  - Negamax with Principal Variation Search (PVS)
 *  - Transposition table (TT) with always-replace
 *  - Iterative deepening
 *  - Move ordering: TT move > corners > killers > history > flip count
 *  - Optional time budget; depth ceiling for safety
 *  - Exact endgame solve when ≤ EXACT_ENDGAME_EMPTIES empty squares remain
 */

import { Board, Color, opponentOf } from '../types';
import { applyMove, countStones, legalMoves } from '../board';
import { evaluateBoard } from './eval';
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
const MATE = 1e7; // exact endgame score uses STONE_DIFF * 100; pad mate

interface KillerSet {
  // up to 2 killer moves per ply
  m: Array<{ row: number; col: number } | null>;
}

let killers: KillerSet[] = [];
let history: number[][] = [];
let nodes = 0;
let ttHits = 0;
let stopAt = Infinity;

function ensurePlyState(maxPlies: number) {
  killers = Array.from({ length: maxPlies + 4 }, () => ({ m: [null, null] }));
  // history[from][to-ish] — we'll use cell index 0..63 as both to keep it simple
  history = Array.from({ length: 64 }, () => new Array(64).fill(0));
}

function moveIndex(m: { row: number; col: number }): number {
  return m.row * 8 + m.col;
}

function compareMoves(
  ttMove: { row: number; col: number } | null,
  killerSet: KillerSet,
  a: { row: number; col: number },
  b: { row: number; col: number }
): number {
  const aTT = ttMove && ttMove.row === a.row && ttMove.col === a.col ? 1 : 0;
  const bTT = ttMove && ttMove.row === b.row && ttMove.col === b.col ? 1 : 0;
  if (aTT !== bTT) return bTT - aTT;
  const aCorner = isCorner(a.row, a.col) ? 1 : 0;
  const bCorner = isCorner(b.row, b.col) ? 1 : 0;
  if (aCorner !== bCorner) return bCorner - aCorner;
  const aKiller = killerSet.m.some(k => k && k.row === a.row && k.col === a.col) ? 1 : 0;
  const bKiller = killerSet.m.some(k => k && k.row === b.row && k.col === b.col) ? 1 : 0;
  if (aKiller !== bKiller) return bKiller - aKiller;
  const aHist = history[moveIndex(a)][moveIndex(a)];
  const bHist = history[moveIndex(b)][moveIndex(b)];
  return bHist - aHist;
}

function isCorner(r: number, c: number): boolean {
  return (r === 0 || r === 7) && (c === 0 || c === 7);
}

function countEmpty(board: Board): number {
  let n = 0;
  for (const row of board) for (const c of row) if (c === null) n++;
  return n;
}

/**
 * Exact endgame solver with α-β. Returns score from `color`'s point of view
 * (negamax convention) — when both sides have passed, this is the exact stone
 * difference for `color` × 1000.
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
  if (Date.now() > stopAt) {
    return evaluateBoard(board, color);
  }
  const moves = legalMoves(board, color);
  if (moves.length === 0) {
    if (passed) {
      // Game over: stone diff from the current side's POV
      const { BLACK, WHITE } = countStones(board);
      const mine = color === 'BLACK' ? BLACK : WHITE;
      const theirs = color === 'BLACK' ? WHITE : BLACK;
      return (mine - theirs) * 1000;
    }
    return -exactEndgame(board, opponentOf(color), -beta, -alpha, true, ply + 1);
  }
  // Move ordering: corners first (cheap heuristic for endgame)
  moves.sort((a, b) => {
    const aCorner = isCorner(a.row, a.col) ? 1 : 0;
    const bCorner = isCorner(b.row, b.col) ? 1 : 0;
    if (aCorner !== bCorner) return bCorner - aCorner;
    return 0;
  });
  let best = -INF;
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
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

/**
 * Negamax with PVS and TT.
 * Score is from `color`'s POV (negamax convention).
 */
function pvs(
  board: Board,
  color: Color,
  depth: number,
  alpha: number,
  beta: number,
  passed: boolean,
  ply: number
): { score: number; move?: { row: number; col: number } } {
  nodes++;
  if (Date.now() > stopAt) {
    return { score: evaluateBoard(board, color) };
  }

  // TT probe
  const key = hashBoard(board, color);
  const tt = ttProbe(key);
  let ttMove: { row: number; col: number } | null = null;
  if (tt) {
    ttHits++;
    if (tt.bestRow >= 0) ttMove = { row: tt.bestRow, col: tt.bestCol };
    if (tt.depth >= depth) {
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
      // Game over branch: exact stone count
      const { BLACK, WHITE } = countStones(board);
      const mine = color === 'BLACK' ? BLACK : WHITE;
      const theirs = color === 'BLACK' ? WHITE : BLACK;
      return { score: (mine - theirs) * 1000 };
    }
    const r = pvs(board, opponentOf(color), depth - 1, -beta, -alpha, true, ply + 1);
    return { score: -r.score };
  }

  // Move ordering
  const killerSet = killers[ply] ?? { m: [null, null] };
  moves.sort((a, b) => compareMoves(ttMove, killerSet, a, b));

  let best = -INF;
  let bestMove: { row: number; col: number } | undefined = undefined;
  let firstMove = true;
  const origAlpha = alpha;

  for (const m of moves) {
    const { newBoard } = applyMove(board, color, m.row, m.col);
    let score: number;
    if (firstMove) {
      score = -pvs(newBoard, opponentOf(color), depth - 1, -beta, -alpha, false, ply + 1)
        .score;
      firstMove = false;
    } else {
      // Null-window probe
      score = -pvs(
        newBoard,
        opponentOf(color),
        depth - 1,
        -alpha - 1,
        -alpha,
        false,
        ply + 1
      ).score;
      if (score > alpha && score < beta) {
        // Re-search with full window
        score = -pvs(
          newBoard,
          opponentOf(color),
          depth - 1,
          -beta,
          -alpha,
          false,
          ply + 1
        ).score;
      }
    }
    if (score > best) {
      best = score;
      bestMove = m;
    }
    if (best > alpha) alpha = best;
    if (alpha >= beta) {
      // Beta cutoff: record killer + history
      if (!killerSet.m.some(k => k && k.row === m.row && k.col === m.col)) {
        killerSet.m[1] = killerSet.m[0];
        killerSet.m[0] = m;
        killers[ply] = killerSet;
      }
      const idx = moveIndex(m);
      history[idx][idx] = (history[idx][idx] ?? 0) + depth * depth;
      break;
    }
  }

  // Store TT entry
  const flag: TTFlag = best <= origAlpha ? 'UPPER' : best >= beta ? 'LOWER' : 'EXACT';
  ttStore(key, depth, best, flag, bestMove?.row ?? -1, bestMove?.col ?? -1);

  return { score: best, move: bestMove };
}

export function strongSearch(
  board: Board,
  color: Color,
  options: StrongSearchOptions
): StrongSearchResult {
  nodes = 0;
  ttHits = 0;
  ttBumpGeneration();
  ensurePlyState(64);
  const start = Date.now();
  stopAt = options.timeBudgetMs ? start + options.timeBudgetMs : Infinity;

  const empty = countEmpty(board);

  // Exact endgame solve when feasible
  if (empty <= options.exactEndgameEmpties) {
    const score = exactEndgame(board, color, -INF, INF, false, 0);
    // We need the best move; do a one-ply expansion to pick.
    const moves = legalMoves(board, color);
    if (moves.length === 0) {
      return { score, depthReached: empty, nodes, ttHits };
    }
    let bestM: { row: number; col: number } | undefined = undefined;
    let bestScore = -INF;
    for (const m of moves) {
      const { newBoard } = applyMove(board, color, m.row, m.col);
      const s = -exactEndgame(newBoard, opponentOf(color), -INF, INF, false, 1);
      if (s > bestScore) {
        bestScore = s;
        bestM = m;
      }
    }
    return { score: bestScore, move: bestM, depthReached: empty, nodes, ttHits };
  }

  // Iterative deepening
  let result: { score: number; move?: { row: number; col: number } } = {
    score: 0,
  };
  let depthReached = 0;
  for (let d = 1; d <= options.maxDepth; d++) {
    if (Date.now() > stopAt) break;
    const r = pvs(board, color, d, -INF, INF, false, 0);
    result = r;
    depthReached = d;
    // Early exit if we've found a forced result that wouldn't change
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
