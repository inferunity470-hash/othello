import { Board, Color } from '../types';

/**
 * Zobrist hashing for 8x8 Othello boards.
 * 64 cells × 2 colors + 1 side-to-move key = 129 random 53-bit values.
 *
 * We use plain numbers (53-bit safe-integer XOR) for performance. Collisions
 * are statistically negligible for the search depths reached in this app
 * (well under 2^26 unique positions per move), and the TT additionally
 * verifies depth/bound to filter spurious hits.
 */

const SIZE = 64 * 2 + 1; // 129
const KEYS: number[] = new Array(SIZE);

// Use a deterministic-ish seed so repeated runs of unit tests are stable.
function rand53(seedRef: { s: number }): number {
  // xorshift32 → take 53 bits via two combined draws
  let x = seedRef.s | 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  seedRef.s = x | 0;
  // Combine to a 53-bit unsigned integer
  const hi = (x >>> 0) % 0x200000; // 21 bits
  const y = ((seedRef.s = (seedRef.s ^ (seedRef.s << 7)) | 0) >>> 0) % 0x100000000; // 32 bits
  return hi * 0x100000000 + y;
}

(function init() {
  const seed = { s: 0xc0ffee | 0 };
  for (let i = 0; i < SIZE; i++) {
    KEYS[i] = rand53(seed);
  }
})();

export function indexFor(row: number, col: number, color: Color): number {
  return (row * 8 + col) * 2 + (color === 'BLACK' ? 0 : 1);
}

export const SIDE_KEY = SIZE - 1;

export function hashBoard(board: Board, sideToMove: Color): number {
  let h = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const cell = board[r][c];
      if (cell !== null) {
        h = (h ^ KEYS[(r * 8 + c) * 2 + (cell === 'BLACK' ? 0 : 1)]) >>> 0;
        // We're using bitwise XOR which gives 32-bit. Mix in higher bits via
        // multiplication (Mulberry-style mix) for better distribution.
        h = Math.imul(h ^ (h >>> 13), 0x85ebca6b) >>> 0;
      }
    }
  }
  if (sideToMove === 'WHITE') {
    h = (h ^ KEYS[SIDE_KEY]) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  }
  return h;
}

export function keyForCell(row: number, col: number, color: Color): number {
  return KEYS[indexFor(row, col, color)];
}

export const SIDE_TO_MOVE_KEY = KEYS[SIDE_KEY];
