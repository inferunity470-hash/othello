import { Color, GameState, opponentOf } from '../types';
import { applyMove, hasLegalMove, legalMoves } from '../board';
import { currentMinBid } from '../bidding';
import { alphabeta, evaluateBoard } from './eval';
import { strongSearch } from './search';

export type AILevel = 'beginner' | 'intermediate' | 'advanced' | 'oni';

export interface AIBidContext {
  state: GameState;
  color: Color;
  level: AILevel;
}

/**
 * "Token cost" — how many board-eval points the AI implicitly pays for
 * losing the initiative token. Under the new rule, the holder loses the
 * token whenever they place a stone, so the AI should be slightly less
 * eager to win bids when it currently holds the token.
 */
const TOKEN_COST = 18;

function deltaValueOfMoving(
  state: GameState,
  color: Color,
  depth: number,
  useStrong = false
): number {
  const opp = opponentOf(color);
  if (useStrong) {
    const me = strongSearch(state.board, color, {
      maxDepth: depth,
      exactEndgameEmpties: 0,
    });
    const them = strongSearch(state.board, opp, {
      maxDepth: depth,
      exactEndgameEmpties: 0,
    });
    // strongSearch returns scores from the searcher's POV. Convert opp score
    // to color's POV by negation.
    return me.score - -them.score;
  }
  const myBest = alphabeta(state.board, color, depth, -Infinity, Infinity, color);
  const oppBest = alphabeta(state.board, opp, depth, -Infinity, Infinity, color);
  return myBest.score - oppBest.score;
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
    const score = flipped.length + cornerBonus + xSquarePenalty;
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
  // Endgame: solve exactly when ≤ 14 empties (strong, may take a few seconds).
  // Midgame: deep PVS with TT.
  let maxDepth: number;
  let exactEndgameEmpties: number;
  if (empties <= 8) {
    maxDepth = 20;
    exactEndgameEmpties = empties;
  } else if (empties <= 14) {
    maxDepth = 18;
    exactEndgameEmpties = empties;
  } else if (empties <= 22) {
    maxDepth = 11;
    exactEndgameEmpties = 0;
  } else {
    maxDepth = 9;
    exactEndgameEmpties = 0;
  }
  const r = strongSearch(state.board, mover, { maxDepth, exactEndgameEmpties });
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

/**
 * Compute the AI's bid for the current BIDDING phase.
 *
 * Initiative-aware: under the placement-driven token rule, winning a bid
 * while holding the token costs the token afterwards. We model this as a
 * fixed eval-point penalty (TOKEN_COST). This makes higher levels more
 * willing to *not* bid as the holder, hoping the opponent takes the play
 * and loses their own token.
 */
export function decideBid(ctx: AIBidContext, rng: () => number = Math.random): number {
  const { state, color, level } = ctx;
  const chips = state.players[color].chips;
  if (chips === 0) return clampBid(0, state, color);
  const isHolder = state.initiativeHolder === color;

  if (level === 'beginner') {
    const cap = Math.max(1, Math.floor(chips * 0.15));
    return clampBid(Math.floor(rng() * cap), state, color);
  }

  if (level === 'intermediate') {
    const delta = deltaValueOfMoving(state, color, 2);
    // Adjust for token cost: holder's effective gain is reduced.
    const adjusted = isHolder ? delta - TOKEN_COST : delta;
    const base = Math.max(2, Math.floor(chips * 0.12));
    let bid = base;
    if (adjusted > 0) {
      bid = Math.max(bid, Math.floor(adjusted * 0.06));
    } else if (adjusted < -300) {
      bid = Math.max(0, Math.floor(chips * 0.02));
    }
    const cap = Math.max(1, Math.floor(chips * 0.35));
    return clampBid(Math.min(bid, cap), state, color);
  }

  if (level === 'advanced') {
    const delta = deltaValueOfMoving(state, color, 3);
    const adjusted = isHolder ? delta - TOKEN_COST : delta;
    if (adjusted <= 0) return clampBid(0, state, color);
    const scaled = Math.floor(adjusted * 0.1) + 1;
    const cap = Math.max(1, Math.floor(chips * 0.5));
    return clampBid(Math.min(scaled, cap), state, color);
  }

  // oni: use strong search for delta evaluation, factor in token, willing
  // to spend up to 70% of stack on critical moves.
  const empties = countEmpty(state.board);
  const depth = empties <= 14 ? 8 : empties <= 22 ? 6 : 5;
  const delta = deltaValueOfMoving(state, color, depth, true);
  const adjusted = isHolder ? delta - TOKEN_COST : delta;
  if (adjusted <= 0) {
    // Reverse-auction: small bid to pressure opponent into placing.
    const reverseBid = Math.min(chips, Math.max(0, Math.floor(-adjusted * 0.04)));
    return clampBid(reverseBid, state, color);
  }
  const cap = Math.max(1, Math.floor(chips * 0.7));
  const scaled = Math.floor(adjusted * 0.13) + 1;
  return clampBid(Math.min(scaled, cap), state, color);
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

function countEmpty(board: import('../types').Board): number {
  let n = 0;
  for (const row of board) for (const c of row) if (c === null) n++;
  return n;
}

export { makeRng };
