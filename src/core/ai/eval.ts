import { Board, Color, opponentOf } from '../types';
import { applyMove, countStones, hasLegalMove, legalMoves } from '../board';

// Refined positional weights — slightly more aggressive on corner-adjacent
// penalties than basic Iago weights to discourage X/C-square plays.
export const POSITION_WEIGHTS: number[][] = [
  [120, -25, 20, 5, 5, 20, -25, 120],
  [-25, -50, -5, -5, -5, -5, -50, -25],
  [20, -5, 15, 3, 3, 15, -5, 20],
  [5, -5, 3, 3, 3, 3, -5, 5],
  [5, -5, 3, 3, 3, 3, -5, 5],
  [20, -5, 15, 3, 3, 15, -5, 20],
  [-25, -50, -5, -5, -5, -5, -50, -25],
  [120, -25, 20, 5, 5, 20, -25, 120],
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
  const opp = opponentOf(color);
  const dirs = [
    [-1, -1],
    [-1, 0],
    [-1, 1],
    [0, -1],
    [0, 1],
    [1, -1],
    [1, 0],
    [1, 1],
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
 * Count corner-anchored stable discs along the four edges and into the
 * board. A simplified approximation that catches the dominant cases without
 * being too expensive.
 */
export function stableDiscScore(board: Board, color: Color): number {
  const stable: boolean[][] = Array.from({ length: 8 }, () => new Array(8).fill(false));

  // 1. Mark corner anchors
  for (const [r, c] of CORNERS) {
    if (board[r][c] === color) stable[r][c] = true;
  }

  // 2. Walk each edge from a corner; consecutive same-color stones are stable.
  // Top edge from (0,0) rightward and from (0,7) leftward
  walkEdge(board, color, stable, 0, 0, 0, 1);
  walkEdge(board, color, stable, 0, 7, 0, -1);
  // Bottom edge
  walkEdge(board, color, stable, 7, 0, 0, 1);
  walkEdge(board, color, stable, 7, 7, 0, -1);
  // Left edge
  walkEdge(board, color, stable, 0, 0, 1, 0);
  walkEdge(board, color, stable, 7, 0, -1, 0);
  // Right edge
  walkEdge(board, color, stable, 0, 7, 1, 0);
  walkEdge(board, color, stable, 7, 7, -1, 0);

  // 3. Iterative deepening of stability into the interior:
  //    a stone is stable if for every direction one of:
  //      (a) the line in that direction (until edge) is full of same color
  //          AND has a stable anchor, OR
  //      (b) the immediate neighbour in that direction is stable & same color.
  // This is an approximation; we just iterate until no change.
  let changed = true;
  while (changed) {
    changed = false;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (stable[r][c] || board[r][c] !== color) continue;
        if (isInteriorStable(board, stable, r, c, color)) {
          stable[r][c] = true;
          changed = true;
        }
      }
    }
  }

  let mine = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (stable[r][c]) mine++;
    }
  }

  // Symmetric calc for opponent (cheap re-run)
  const oppStable: boolean[][] = Array.from({ length: 8 }, () =>
    new Array(8).fill(false)
  );
  const opp = opponentOf(color);
  for (const [r, c] of CORNERS) {
    if (board[r][c] === opp) oppStable[r][c] = true;
  }
  walkEdge(board, opp, oppStable, 0, 0, 0, 1);
  walkEdge(board, opp, oppStable, 0, 7, 0, -1);
  walkEdge(board, opp, oppStable, 7, 0, 0, 1);
  walkEdge(board, opp, oppStable, 7, 7, 0, -1);
  walkEdge(board, opp, oppStable, 0, 0, 1, 0);
  walkEdge(board, opp, oppStable, 7, 0, -1, 0);
  walkEdge(board, opp, oppStable, 0, 7, 1, 0);
  walkEdge(board, opp, oppStable, 7, 7, -1, 0);
  changed = true;
  while (changed) {
    changed = false;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (oppStable[r][c] || board[r][c] !== opp) continue;
        if (isInteriorStable(board, oppStable, r, c, opp)) {
          oppStable[r][c] = true;
          changed = true;
        }
      }
    }
  }
  let theirs = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (oppStable[r][c]) theirs++;
    }
  }
  if (mine + theirs === 0) return 0;
  return (100 * (mine - theirs)) / (mine + theirs);
}

function walkEdge(
  board: Board,
  color: Color,
  stable: boolean[][],
  startR: number,
  startC: number,
  dr: number,
  dc: number
) {
  if (board[startR]?.[startC] !== color) return;
  let r = startR;
  let c = startC;
  while (r >= 0 && r < 8 && c >= 0 && c < 8 && board[r][c] === color) {
    stable[r][c] = true;
    r += dr;
    c += dc;
  }
}

function isInteriorStable(
  board: Board,
  stable: boolean[][],
  r: number,
  c: number,
  color: Color
): boolean {
  // For each of 4 axes, the disc is stable if at least one direction:
  //   - the cell is on a board edge (no further disc possible), OR
  //   - the immediate neighbour same-color is stable, OR
  //   - the line is fully filled in that direction (no flips possible).
  const axes: Array<[number, number]> = [
    [0, 1], // horizontal
    [1, 0], // vertical
    [1, 1], // diagonal
    [1, -1], // anti-diagonal
  ];
  for (const [dr, dc] of axes) {
    if (!axisStable(board, stable, r, c, dr, dc, color)) return false;
  }
  return true;
}

function axisStable(
  board: Board,
  stable: boolean[][],
  r: number,
  c: number,
  dr: number,
  dc: number,
  color: Color
): boolean {
  return (
    halfStable(board, stable, r, c, dr, dc, color) ||
    halfStable(board, stable, r, c, -dr, -dc, color)
  );
}

function halfStable(
  board: Board,
  stable: boolean[][],
  r: number,
  c: number,
  dr: number,
  dc: number,
  color: Color
): boolean {
  let nr = r + dr;
  let nc = c + dc;
  if (nr < 0 || nr >= 8 || nc < 0 || nc >= 8) return true; // off board
  // Adjacent same-color and stable
  if (board[nr][nc] === color && stable[nr][nc]) return true;
  // Line fully filled to edge in this direction
  while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
    if (board[nr][nc] === null) return false;
    nr += dr;
    nc += dc;
  }
  return true;
}

/**
 * Phase-aware evaluator. Higher-quality than the previous version:
 * adds stable disc count and tunes mobility/positional weights per phase.
 */
export function evaluateBoard(board: Board, color: Color): number {
  const empty = countEmpty(board);
  const filled = 64 - empty;
  if (empty === 0) {
    return stoneDifference(board, color) * 1000;
  }
  if (filled < 20) {
    // opening: positional + mobility dominates
    return (
      positionalScore(board, color) * 1.0 +
      mobilityScore(board, color) * 6.0 +
      cornerControl(board, color) * 14.0 +
      frontierScore(board, color) * 2.0 +
      stableDiscScore(board, color) * 4.0
    );
  }
  if (filled < 50) {
    // midgame: stable discs and corners matter more
    return (
      positionalScore(board, color) * 1.0 +
      mobilityScore(board, color) * 5.0 +
      cornerControl(board, color) * 16.0 +
      frontierScore(board, color) * 2.5 +
      stableDiscScore(board, color) * 8.0 +
      stoneDifference(board, color) * 0.5
    );
  }
  // endgame: stones and stability dominate
  return (
    positionalScore(board, color) * 0.4 +
    mobilityScore(board, color) * 1.0 +
    cornerControl(board, color) * 10.0 +
    stableDiscScore(board, color) * 12.0 +
    stoneDifference(board, color) * 6.0
  );
}

function countEmpty(board: Board): number {
  let n = 0;
  for (const row of board) for (const c of row) if (c === null) n++;
  return n;
}

/**
 * Legacy plain α-β kept for advanced/intermediate levels and for tests.
 * Oni uses the upgraded search in `search.ts`.
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
      // Game over: return exact stone difference from rootColor's POV.
      // This is critical for accurate evaluation — the phase-weighted
      // evaluator can severely mis-score wipe-out positions (e.g. 0 stones
      // remaining for one side) because stoneDifference is omitted in the
      // opening phase weights.
      const { BLACK, WHITE } = countStones(board);
      const mine = rootColor === 'BLACK' ? BLACK : WHITE;
      const theirs = rootColor === 'BLACK' ? WHITE : BLACK;
      return { score: (mine - theirs) * 1000 };
    }
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
      if (r.score > best.score) best = { score: r.score, move: m };
      alpha = Math.max(alpha, r.score);
      if (alpha >= beta) break;
    } else {
      if (r.score < best.score) best = { score: r.score, move: m };
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
