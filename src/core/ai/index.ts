import { Color, GameState, opponentOf } from '../types';
import { applyMove, hasLegalMove, legalMoves } from '../board';
import { currentMinBid } from '../bidding';
import { alphabeta, evaluateBoard } from './eval';

export type AILevel = 'beginner' | 'intermediate' | 'advanced' | 'oni';

export interface AIDecision {
  bid: number;
  /** Stone placement when this AI is the entitled mover. */
  pickMove: (state: GameState, mover: Color) => { row: number; col: number };
}

export interface AIBidContext {
  state: GameState;
  color: Color;
  level: AILevel;
}

/**
 * Compute the "value of moving" minus "value of opponent moving" using a
 * board-only alpha-beta search at the given depth. This is used by all
 * non-trivial levels to choose how aggressively to bid.
 */
function deltaValueOfMoving(
  state: GameState,
  color: Color,
  depth: number
): number {
  const opp = opponentOf(color);
  const myBest = alphabeta(state.board, color, depth, -Infinity, Infinity, color);
  const oppBest = alphabeta(state.board, opp, depth, -Infinity, Infinity, color);
  // Both scores are from `color`'s POV.
  // - myBest: the best position `color` can reach if `color` moves first.
  // - oppBest: the best position `color` can reach (worst for color) if opponent moves first.
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

function pickGreedyMove(
  state: GameState,
  mover: Color
): { row: number; col: number } {
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
  // X-squares are the 4 cells diagonally inside each corner: (1,1), (1,6), (6,1), (6,6)
  const xMap: Array<[[number, number], [number, number]]> = [
    [[1, 1], [0, 0]],
    [[1, 6], [0, 7]],
    [[6, 1], [7, 0]],
    [[6, 6], [7, 7]],
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

function makeRng(seed?: number): () => number {
  let s = seed ?? Date.now();
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/**
 * Compute the AI's bid for the current BIDDING phase.
 */
export function decideBid(ctx: AIBidContext, rng: () => number = Math.random): number {
  const { state, color, level } = ctx;
  const chips = state.players[color].chips;
  if (chips === 0) return clampBid(0, state, color);

  if (level === 'beginner') {
    // small random bid
    const cap = Math.max(1, Math.floor(chips * 0.15));
    return clampBid(Math.floor(rng() * cap), state, color);
  }

  if (level === 'intermediate') {
    // Bid scaled to outcompete naive random opponents.
    const delta = deltaValueOfMoving(state, color, 2);
    const base = Math.max(2, Math.floor(chips * 0.12));
    let bid = base;
    if (delta > 0) {
      bid = Math.max(bid, Math.floor(delta * 0.07));
    } else if (delta < -300) {
      // We *want* opponent to play (zugzwang). Don't bid much.
      bid = Math.max(0, Math.floor(chips * 0.02));
    }
    const cap = Math.max(1, Math.floor(chips * 0.35));
    return clampBid(Math.min(bid, cap), state, color);
  }

  if (level === 'advanced') {
    const delta = deltaValueOfMoving(state, color, 3);
    if (delta <= 0) return clampBid(0, state, color);
    // More aggressive than intermediate, willing to commit half the stack
    // for game-deciding moves (depth-3 perspective).
    const scaled = Math.floor(delta * 0.1) + 1;
    const cap = Math.max(1, Math.floor(chips * 0.5));
    return clampBid(Math.min(scaled, cap), state, color);
  }

  // oni: deeper search, dynamic depth based on empties
  const empties = countEmpty(state.board);
  let depth: number;
  if (empties <= 8) depth = empties; // exact endgame solve up to 8
  else if (empties <= 12) depth = 6;
  else depth = 5;
  const delta = deltaValueOfMoving(state, color, depth);

  if (delta <= 0) {
    // Reverse-auction logic: if we DON'T want to move, sometimes bid up to push
    // the opponent into placing. Spec §0 mentions "逆オークション".
    const reverseBid = Math.min(
      chips,
      Math.max(0, Math.floor(-delta * 0.04))
    );
    return clampBid(reverseBid, state, color);
  }
  // Aggressive: oni is willing to spend up to 60% of stack on critical moves.
  const cap = Math.max(1, Math.floor(chips * 0.6));
  // Bid slightly above the linear value to outbid weaker AIs and human intuition.
  const scaled = Math.floor(delta * 0.12) + 1;
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
  // oni: depth 6 in midgame, deeper at endgame
  const empties = countEmpty(state.board);
  let depth: number;
  if (empties <= 10) depth = empties; // exact endgame
  else if (empties <= 16) depth = 7;
  else depth = 6;
  return pickAlphaBetaMove(state, mover, depth);
}

function countEmpty(board: import('../types').Board): number {
  let n = 0;
  for (const row of board) for (const c of row) if (c === null) n++;
  return n;
}

export { makeRng };
