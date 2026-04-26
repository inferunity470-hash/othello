import { Board, Color, opponentOf } from '../types';
import { applyMove, countStones, hasLegalMove, legalMoves } from '../board';

// Positional weight table tuned for 8x8 Othello (corners high, X-squares deeply penalized)
// Standard "Iago"-style weights.
export const POSITION_WEIGHTS: number[][] = [
  [120, -20, 20, 5, 5, 20, -20, 120],
  [-20, -40, -5, -5, -5, -5, -40, -20],
  [20, -5, 15, 3, 3, 15, -5, 20],
  [5, -5, 3, 3, 3, 3, -5, 5],
  [5, -5, 3, 3, 3, 3, -5, 5],
  [20, -5, 15, 3, 3, 15, -5, 20],
  [-20, -40, -5, -5, -5, -5, -40, -20],
  [120, -20, 20, 5, 5, 20, -20, 120],
];

const CORNERS: Array<[number, number]> = [
  [0, 0],
  [0, 7],
  [7, 0],
  [7, 7],
];

export function positionalScore(board: Board, color: Color): number {
  const opp = opponentOf(color);
  let s = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c] === color) s += POSITION_WEIGHTS[r][c];
      else if (board[r][c] === opp) s -= POSITION_WEIGHTS[r][c];
    }
  }
  return s;
}

export function mobilityScore(board: Board, color: Color): number {
  const m = legalMoves(board, color).length;
  const o = legalMoves(board, opponentOf(color)).length;
  if (m + o === 0) return 0;
  return (100 * (m - o)) / (m + o);
}

export function cornerControl(board: Board, color: Color): number {
  const opp = opponentOf(color);
  let mine = 0;
  let theirs = 0;
  for (const [r, c] of CORNERS) {
    if (board[r][c] === color) mine++;
    else if (board[r][c] === opp) theirs++;
  }
  return 25 * (mine - theirs);
}

export function stoneDifference(board: Board, color: Color): number {
  const { BLACK, WHITE } = countStones(board);
  const mine = color === 'BLACK' ? BLACK : WHITE;
  const theirs = color === 'BLACK' ? WHITE : BLACK;
  if (mine + theirs === 0) return 0;
  return (100 * (mine - theirs)) / (mine + theirs);
}

export function frontierScore(board: Board, color: Color): number {
  // Count "frontier" discs (those adjacent to empty squares). Fewer is better.
  const opp = opponentOf(color);
  const dirs = [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1], [0, 1],
    [1, -1], [1, 0], [1, 1],
  ];
  let mine = 0;
  let theirs = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const cell = board[r][c];
      if (cell === null) continue;
      let isFrontier = false;
      for (const [dr, dc] of dirs) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nr >= 8 || nc < 0 || nc >= 8) continue;
        if (board[nr][nc] === null) {
          isFrontier = true;
          break;
        }
      }
      if (isFrontier) {
        if (cell === color) mine++;
        else if (cell === opp) theirs++;
      }
    }
  }
  if (mine + theirs === 0) return 0;
  return (-100 * (mine - theirs)) / (mine + theirs);
}

/**
 * Phase-aware evaluator.
 *  - early/mid game: positional + mobility + corners > stone count
 *  - end game: stone count dominates
 */
export function evaluateBoard(board: Board, color: Color): number {
  const empty = countEmpty(board);
  const filled = 64 - empty;
  if (empty === 0) {
    return stoneDifference(board, color) * 1000;
  }
  if (filled < 20) {
    // opening
    return (
      positionalScore(board, color) * 1.0 +
      mobilityScore(board, color) * 5.0 +
      cornerControl(board, color) * 10.0 +
      frontierScore(board, color) * 2.0
    );
  }
  if (filled < 50) {
    return (
      positionalScore(board, color) * 1.0 +
      mobilityScore(board, color) * 4.0 +
      cornerControl(board, color) * 12.0 +
      frontierScore(board, color) * 2.0 +
      stoneDifference(board, color) * 0.5
    );
  }
  // endgame
  return (
    positionalScore(board, color) * 0.5 +
    mobilityScore(board, color) * 1.0 +
    cornerControl(board, color) * 8.0 +
    stoneDifference(board, color) * 5.0
  );
}

function countEmpty(board: Board): number {
  let n = 0;
  for (const row of board) for (const c of row) if (c === null) n++;
  return n;
}

/**
 * Alpha-beta search returning best move and its score from `color`'s perspective.
 * Search treats opponent as alternating (standard othello, not bidding-aware).
 */
export interface SearchResult {
  score: number;
  move?: { row: number; col: number };
}

export function alphabeta(
  board: Board,
  color: Color,
  depth: number,
  alpha: number,
  beta: number,
  rootColor: Color,
  passedOnce = false
): SearchResult {
  if (depth === 0) {
    return { score: evaluateBoard(board, rootColor) };
  }
  const moves = legalMoves(board, color);
  if (moves.length === 0) {
    if (passedOnce) {
      // game effectively over from this branch's POV
      return { score: evaluateBoard(board, rootColor) };
    }
    // pass turn
    const r = alphabeta(
      board,
      opponentOf(color),
      depth - 1,
      alpha,
      beta,
      rootColor,
      true
    );
    return { score: r.score };
  }

  // Move ordering: try corners first, then by simple flip count
  moves.sort((a, b) => {
    const ac = isCorner(a.row, a.col) ? 1 : 0;
    const bc = isCorner(b.row, b.col) ? 1 : 0;
    if (ac !== bc) return bc - ac;
    return 0;
  });

  let best: SearchResult = { score: color === rootColor ? -Infinity : Infinity };
  for (const m of moves) {
    const { newBoard } = applyMove(board, color, m.row, m.col);
    const r = alphabeta(
      newBoard,
      opponentOf(color),
      depth - 1,
      alpha,
      beta,
      rootColor,
      false
    );
    if (color === rootColor) {
      if (r.score > best.score) {
        best = { score: r.score, move: m };
      }
      alpha = Math.max(alpha, r.score);
      if (alpha >= beta) break;
    } else {
      if (r.score < best.score) {
        best = { score: r.score, move: m };
      }
      beta = Math.min(beta, r.score);
      if (alpha >= beta) break;
    }
  }
  return best;
}

function isCorner(r: number, c: number): boolean {
  return (r === 0 || r === 7) && (c === 0 || c === 7);
}

export { hasLegalMove };
