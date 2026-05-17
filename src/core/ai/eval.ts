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
 * Edge pattern feature flag (Codex T12). Default 0 (disabled).
 * Set ONI_EDGE_PATTERN=1 (full) or 0.5 (half) to enable.
 */
function edgePatternMultiplier(): number {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proc = (globalThis as any).process;
  if (!proc || !proc.env) return 0;
  const v = proc.env.ONI_EDGE_PATTERN as string | undefined;
  if (v === undefined || v === '') return 0;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

// 3^8 = 6561 edge patterns. Each edge (top, right, bottom, left) is read as
// 8 cells; cells map to 0=BLACK, 1=WHITE, 2=EMPTY. Weights are written from
// BLACK's POV — evaluateBoard negates for WHITE so f(B) === -f(W) is
// preserved (required by aiEvalSymmetry.test.ts).
const EDGE_PATTERN_WEIGHTS: number[] = buildEdgePatternWeights();

function buildEdgePatternWeights(): number[] {
  const table = new Array<number>(6561).fill(0);
  for (let index = 0; index < 6561; index++) {
    table[index] = scoreEdgePatternForBlack(decodeEdgePattern(index));
  }
  return table;
}

function decodeEdgePattern(index: number): number[] {
  const cells = new Array<number>(8);
  for (let i = 7; i >= 0; i--) {
    cells[i] = index % 3;
    index = (index / 3) | 0;
  }
  return cells;
}

function scoreEdgePatternForBlack(cells: number[]): number {
  let s = 0;

  // Corner anchors (overlap with cornerControl on purpose; weight kept small).
  s += cornerCellValue(cells[0]);
  s += cornerCellValue(cells[7]);

  // C-squares adjacent to the corners.
  s += cSquareValue(cells[1], cells[0]);
  s += cSquareValue(cells[6], cells[7]);

  // Anchored runs from each corner — proxy for edge stability.
  s += anchoredRunValue(cells, 0, +1);
  s += anchoredRunValue(cells, 7, -1);

  // Edge stone balance (weak signal).
  s += edgeStoneBalance(cells);

  // Open early edges shouldn't dominate evaluation.
  let empties = 0;
  for (let i = 0; i < 8; i++) if (cells[i] === 2) empties++;
  if (empties >= 5) s = (s * 0.5) | 0;

  // Cap per-edge contribution. Sum over 4 edges is bounded roughly -48..+48.
  if (s > 12) s = 12;
  if (s < -12) s = -12;
  return s;
}

function cornerCellValue(cell: number): number {
  if (cell === 0) return 6; // BLACK
  if (cell === 1) return -6; // WHITE
  return 0;
}

function cSquareValue(c: number, corner: number): number {
  if (c === 2) return 0;
  const owner = c === 0 ? 1 : -1;
  if (corner === 2) {
    // Adjacent to an empty corner — dangerous for the owner.
    return -owner * 3;
  }
  const cornerOwner = corner === 0 ? 1 : -1;
  return owner === cornerOwner ? owner * 2 : owner * -2;
}

function anchoredRunValue(cells: number[], start: 0 | 7, step: 1 | -1): number {
  const corner = cells[start];
  if (corner === 2) return 0;
  const owner = corner === 0 ? 1 : -1;
  let run = 0;
  for (let i = start; i >= 0 && i < 8; i += step) {
    if (cells[i] !== corner) break;
    run++;
  }
  return owner * Math.min(6, (run - 1) * 2);
}

function edgeStoneBalance(cells: number[]): number {
  let black = 0;
  let white = 0;
  for (const c of cells) {
    if (c === 0) black++;
    else if (c === 1) white++;
  }
  return black - white;
}

function encodeEdge(cells: ReadonlyArray<number>): number {
  let index = 0;
  for (let i = 0; i < 8; i++) index = index * 3 + cells[i];
  return index;
}

function cellCode(cell: 'BLACK' | 'WHITE' | null): number {
  if (cell === 'BLACK') return 0;
  if (cell === 'WHITE') return 1;
  return 2;
}

/**
 * Sum of edge-pattern weights across the four edges. Always written from
 * BLACK's POV; the caller negates for WHITE so the negamax antisymmetry
 * is automatically preserved.
 */
export function edgePatternScore(board: Board, color: Color): number {
  const top = [
    cellCode(board[0][0]),
    cellCode(board[0][1]),
    cellCode(board[0][2]),
    cellCode(board[0][3]),
    cellCode(board[0][4]),
    cellCode(board[0][5]),
    cellCode(board[0][6]),
    cellCode(board[0][7]),
  ];
  const right = [
    cellCode(board[0][7]),
    cellCode(board[1][7]),
    cellCode(board[2][7]),
    cellCode(board[3][7]),
    cellCode(board[4][7]),
    cellCode(board[5][7]),
    cellCode(board[6][7]),
    cellCode(board[7][7]),
  ];
  const bottom = [
    cellCode(board[7][7]),
    cellCode(board[7][6]),
    cellCode(board[7][5]),
    cellCode(board[7][4]),
    cellCode(board[7][3]),
    cellCode(board[7][2]),
    cellCode(board[7][1]),
    cellCode(board[7][0]),
  ];
  const left = [
    cellCode(board[7][0]),
    cellCode(board[6][0]),
    cellCode(board[5][0]),
    cellCode(board[4][0]),
    cellCode(board[3][0]),
    cellCode(board[2][0]),
    cellCode(board[1][0]),
    cellCode(board[0][0]),
  ];
  const raw =
    EDGE_PATTERN_WEIGHTS[encodeEdge(top)] +
    EDGE_PATTERN_WEIGHTS[encodeEdge(right)] +
    EDGE_PATTERN_WEIGHTS[encodeEdge(bottom)] +
    EDGE_PATTERN_WEIGHTS[encodeEdge(left)];
  if (raw === 0) return 0; // avoid -0 from the BLACK→WHITE negation
  return color === 'BLACK' ? raw : -raw;
}

/**
 * Phase-aware evaluator. Negamax-friendly: result for `color` always equals
 * the negation of the result for `opponentOf(color)` (within fp rounding).
 */
export function evaluateBoard(board: Board, color: Color): number {
  const empty = countEmpty(board);
  const filled = 64 - empty;
  if (empty === 0) {
    // H11: align with the both-pass terminal score used by pvs/exactEndgame
    // (`(mine - theirs) * 1000`). The old percentage-based scale (stones /
    // 64 * 100 * 1000) produced inconsistent values for the same terminal
    // position depending on which code path observed it.
    const { BLACK, WHITE } = countStones(board);
    const mine = color === 'BLACK' ? BLACK : WHITE;
    const theirs = color === 'BLACK' ? WHITE : BLACK;
    return (mine - theirs) * 1000;
  }
  const adjMul = cornerAdjMultiplier();
  const edgeMul = edgePatternMultiplier();
  const edgeOpening = edgeMul === 0 ? 0 : edgePatternScore(board, color) * 0.35 * edgeMul;
  const edgeMid = edgeMul === 0 ? 0 : edgePatternScore(board, color) * 0.6 * edgeMul;
  const edgeEnd = edgeMul === 0 ? 0 : edgePatternScore(board, color) * 0.25 * edgeMul;
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
      edgeOpening +
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
      edgeMid +
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
    edgeEnd +
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
