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

const DIRS: Array<[number, number]> = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
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

/**
 * Allocation-free count of legal moves for `color`.
 * Significantly faster than `legalMoves(...).length` in tight inner loops.
 */
export function mobilityCount(board: Board, color: Color): number {
  const opp = opponentOf(color);
  let count = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c] !== null) continue;
      // Try each direction; cell is legal as soon as one direction yields ≥1 flip.
      let legal = false;
      for (let d = 0; d < 8 && !legal; d++) {
        const dr = DIRS[d][0];
        const dc = DIRS[d][1];
        let nr = r + dr;
        let nc = c + dc;
        let saw = 0;
        while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && board[nr][nc] === opp) {
          saw++;
          nr += dr;
          nc += dc;
        }
        if (saw > 0 && nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && board[nr][nc] === color) {
          legal = true;
        }
      }
      if (legal) count++;
    }
  }
  return count;
}

export function mobilityScore(board: Board, color: Color): number {
  const m = mobilityCount(board, color);
  const o = mobilityCount(board, opponentOf(color));
  if (m + o === 0) return 0;
  return (100 * (m - o)) / (m + o);
}

/**
 * "Potential mobility" — empty cells adjacent to ≥1 of opponent's stones.
 * Each such cell is a place where the opponent could be flanked. This
 * heuristic catches threats that would not yet show up in plain mobility.
 */
export function potentialMobilityScore(board: Board, color: Color): number {
  const opp = opponentOf(color);
  let mine = 0;
  let theirs = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c] !== null) continue;
      let nearOpp = false;
      let nearMine = false;
      for (let d = 0; d < 8; d++) {
        const nr = r + DIRS[d][0];
        const nc = c + DIRS[d][1];
        if (nr < 0 || nr >= 8 || nc < 0 || nc >= 8) continue;
        const cell = board[nr][nc];
        if (cell === opp) nearOpp = true;
        else if (cell === color) nearMine = true;
      }
      if (nearOpp) mine++;
      if (nearMine) theirs++;
    }
  }
  if (mine + theirs === 0) return 0;
  return (100 * (mine - theirs)) / (mine + theirs);
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

/**
 * Frontier = stones adjacent to ≥1 empty cell. Frontier stones are flippable
 * and therefore weak. Sign convention: lower frontier count for me is better,
 * hence the leading minus.
 */
export function frontierScore(board: Board, color: Color): number {
  const opp = opponentOf(color);
  let mine = 0;
  let theirs = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const cell = board[r][c];
      if (cell === null) continue;
      let isFrontier = false;
      for (let d = 0; d < 8 && !isFrontier; d++) {
        const nr = r + DIRS[d][0];
        const nc = c + DIRS[d][1];
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
 * Compute corner-anchored stable discs for BOTH colors in a single pass.
 * Returns counts (raw, not normalised). Used internally by
 * `stableDiscScore` and exposed for callers that need both sides at once.
 */
export function stableDiscCounts(board: Board): { black: number; white: number } {
  const stableB: boolean[][] = Array.from({ length: 8 }, () => new Array(8).fill(false));
  const stableW: boolean[][] = Array.from({ length: 8 }, () => new Array(8).fill(false));

  // Seed from corners (anchors)
  for (const [r, c] of CORNERS) {
    if (board[r][c] === 'BLACK') stableB[r][c] = true;
    else if (board[r][c] === 'WHITE') stableW[r][c] = true;
  }
  // Walk each edge ray from every corner: contiguous same-color stones are stable
  for (const [sr, sc, dr, dc] of [
    [0, 0, 0, 1],
    [0, 0, 1, 0],
    [0, 7, 0, -1],
    [0, 7, 1, 0],
    [7, 0, 0, 1],
    [7, 0, -1, 0],
    [7, 7, 0, -1],
    [7, 7, -1, 0],
  ] as Array<[number, number, number, number]>) {
    const seed = board[sr][sc];
    if (seed == null) continue;
    const tab = seed === 'BLACK' ? stableB : stableW;
    let r = sr;
    let c = sc;
    while (r >= 0 && r < 8 && c >= 0 && c < 8 && board[r][c] === seed) {
      tab[r][c] = true;
      r += dr;
      c += dc;
    }
  }

  // Iteratively flood interior stability for each color.
  flood(board, stableB, 'BLACK');
  flood(board, stableW, 'WHITE');

  let black = 0;
  let white = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (stableB[r][c]) black++;
      if (stableW[r][c]) white++;
    }
  }
  return { black, white };
}

function flood(board: Board, stable: boolean[][], color: Color): void {
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
}

export function stableDiscScore(board: Board, color: Color): number {
  const { black, white } = stableDiscCounts(board);
  const mine = color === 'BLACK' ? black : white;
  const theirs = color === 'BLACK' ? white : black;
  if (mine + theirs === 0) return 0;
  return (100 * (mine - theirs)) / (mine + theirs);
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
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];
  for (const [dr, dc] of axes) {
    if (
      !halfStable(board, stable, r, c, dr, dc, color) &&
      !halfStable(board, stable, r, c, -dr, -dc, color)
    ) {
      return false;
    }
  }
  return true;
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
  const nr = r + dr;
  const nc = c + dc;
  if (nr < 0 || nr >= 8 || nc < 0 || nc >= 8) return true; // off board
  if (board[nr][nc] === color && stable[nr][nc]) return true;
  // Line fully filled to edge
  let r2 = nr;
  let c2 = nc;
  while (r2 >= 0 && r2 < 8 && c2 >= 0 && c2 < 8) {
    if (board[r2][c2] === null) return false;
    r2 += dr;
    c2 += dc;
  }
  return true;
}

/**
 * Endgame parity: in Othello, controlling who plays the last move is worth
 * a small but real advantage. With an even number of empties, the side
 * NOT to move now will play the very last placement. Sign matches `color`.
 */
export function parityScore(board: Board, color: Color, sideToMove: Color): number {
  let empty = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c] === null) empty++;
    }
  }
  if (empty === 0) return 0;
  // If empties is even, the side-to-move plays the second-to-last move; the
  // OTHER side plays last. If odd, side-to-move plays last.
  const lastMover: Color = empty % 2 === 1 ? sideToMove : opponentOf(sideToMove);
  return lastMover === color ? 8 : -8;
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
  if (filled < 20) {
    // Opening: position, mobility, corners, frontier, stable, potential mobility
    return (
      positionalScore(board, color) * 1.0 +
      mobilityScore(board, color) * 6.0 +
      cornerControl(board, color) * 14.0 +
      frontierScore(board, color) * 2.0 +
      stableDiscScore(board, color) * 4.0 +
      potentialMobilityScore(board, color) * 3.0
    );
  }
  if (filled < 50) {
    // Midgame: stability + corners dominate
    return (
      positionalScore(board, color) * 1.0 +
      mobilityScore(board, color) * 5.0 +
      cornerControl(board, color) * 16.0 +
      frontierScore(board, color) * 2.5 +
      stableDiscScore(board, color) * 8.0 +
      potentialMobilityScore(board, color) * 2.5 +
      stoneDifference(board, color) * 0.5
    );
  }
  // Endgame: stones, stability and parity dominate
  return (
    positionalScore(board, color) * 0.4 +
    mobilityScore(board, color) * 1.0 +
    cornerControl(board, color) * 10.0 +
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

  // Move ordering: corners first, then by post-move opponent mobility (fewer = better).
  // Cap to a depth where the extra ordering is worth its cost.
  if (depth >= 2 && moves.length > 1) {
    const scores: number[] = new Array(moves.length);
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      let s = isCorner(m.row, m.col) ? 10000 : 0;
      // Avoid X/C if corresponding corner is empty
      if (isXSquareNextToFreeCorner(board, m.row, m.col)) s -= 800;
      // Quick mobility-after estimate (allocates one new board, but bounded)
      const { newBoard } = applyMove(board, color, m.row, m.col);
      s -= mobilityCount(newBoard, opponentOf(color)) * 8;
      scores[i] = s;
    }
    // Selection sort by descending score (small N, simpler than indirect sort)
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
  } else {
    moves.sort((a, b) => {
      const ac = isCorner(a.row, a.col) ? 1 : 0;
      const bc = isCorner(b.row, b.col) ? 1 : 0;
      return bc - ac;
    });
  }

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

function isXSquareNextToFreeCorner(board: Board, r: number, c: number): boolean {
  const xMap: Array<[number, number, number, number]> = [
    [1, 1, 0, 0],
    [1, 6, 0, 7],
    [6, 1, 7, 0],
    [6, 6, 7, 7],
  ];
  for (const [xr, xc, cr, cc] of xMap) {
    if (r === xr && c === xc && board[cr][cc] === null) return true;
  }
  return false;
}

export { hasLegalMove };
