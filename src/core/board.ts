import { Board, Cell, Color, CONFIG, opponentOf } from './types';

const DIRECTIONS: Array<[number, number]> = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],           [0, 1],
  [1, -1],  [1, 0],  [1, 1],
];

export function createInitialBoard(): Board {
  const size = CONFIG.BOARD_SIZE;
  const board: Board = Array.from({ length: size }, () =>
    Array.from({ length: size }, (): Cell => null)
  );
  // standard othello initial: D4=W, E4=B, D5=B, E5=W (1-indexed)
  // 0-indexed: [3][3]=W, [3][4]=B, [4][3]=B, [4][4]=W
  board[3][3] = 'WHITE';
  board[3][4] = 'BLACK';
  board[4][3] = 'BLACK';
  board[4][4] = 'WHITE';
  return board;
}

export function cloneBoard(board: Board): Board {
  return board.map((row) => row.slice());
}

export function inBounds(row: number, col: number): boolean {
  return row >= 0 && row < CONFIG.BOARD_SIZE && col >= 0 && col < CONFIG.BOARD_SIZE;
}

function flipsInDirection(
  board: Board,
  row: number,
  col: number,
  dr: number,
  dc: number,
  color: Color
): Array<[number, number]> {
  const opp = opponentOf(color);
  const flips: Array<[number, number]> = [];
  let r = row + dr;
  let c = col + dc;
  while (inBounds(r, c) && board[r][c] === opp) {
    flips.push([r, c]);
    r += dr;
    c += dc;
  }
  if (flips.length === 0) return [];
  if (!inBounds(r, c) || board[r][c] !== color) return [];
  return flips;
}

export function getFlips(
  board: Board,
  color: Color,
  row: number,
  col: number
): Array<[number, number]> {
  if (!inBounds(row, col) || board[row][col] !== null) return [];
  const all: Array<[number, number]> = [];
  for (const [dr, dc] of DIRECTIONS) {
    const flips = flipsInDirection(board, row, col, dr, dc, color);
    for (const f of flips) all.push(f);
  }
  return all;
}

export function isLegalMove(
  board: Board,
  color: Color,
  row: number,
  col: number
): boolean {
  return getFlips(board, color, row, col).length > 0;
}

export function legalMoves(
  board: Board,
  color: Color
): Array<{ row: number; col: number }> {
  const moves: Array<{ row: number; col: number }> = [];
  const size = CONFIG.BOARD_SIZE;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c] !== null) continue;
      if (isLegalMove(board, color, r, c)) {
        moves.push({ row: r, col: c });
      }
    }
  }
  return moves;
}

export function hasLegalMove(board: Board, color: Color): boolean {
  const size = CONFIG.BOARD_SIZE;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c] !== null) continue;
      if (isLegalMove(board, color, r, c)) return true;
    }
  }
  return false;
}

export function applyMove(
  board: Board,
  color: Color,
  row: number,
  col: number
): { newBoard: Board; flipped: Array<[number, number]> } {
  const flips = getFlips(board, color, row, col);
  if (flips.length === 0) {
    throw new Error(`Illegal move at (${row}, ${col}) for ${color}`);
  }
  const newBoard = cloneBoard(board);
  newBoard[row][col] = color;
  for (const [r, c] of flips) {
    newBoard[r][c] = color;
  }
  return { newBoard, flipped: flips };
}

export function countStones(board: Board): { BLACK: number; WHITE: number } {
  let b = 0;
  let w = 0;
  for (const row of board) {
    for (const cell of row) {
      if (cell === 'BLACK') b++;
      else if (cell === 'WHITE') w++;
    }
  }
  return { BLACK: b, WHITE: w };
}

export function detectCornerGain(
  before: Board,
  after: Board,
  mover: Color
): number {
  let count = 0;
  for (const [r, c] of CONFIG.CORNER_SQUARES) {
    if (before[r][c] !== mover && after[r][c] === mover) count++;
  }
  return count;
}

export function isCornerSquare(row: number, col: number): boolean {
  for (const [r, c] of CONFIG.CORNER_SQUARES) {
    if (r === row && c === col) return true;
  }
  return false;
}
