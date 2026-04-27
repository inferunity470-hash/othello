/**
 * Transposition table (TT) with always-replace strategy.
 * Fixed-size hash array indexed by `key & (SIZE-1)`.
 */

export type TTFlag = 'EXACT' | 'LOWER' | 'UPPER';

export interface TTEntry {
  key: number;
  depth: number;
  score: number;
  flag: TTFlag;
  bestRow: number; // -1 if no move
  bestCol: number;
  age: number;
}

const SIZE = 1 << 18; // 262,144 entries → ~6 MB rough memory
const MASK = SIZE - 1;

let TABLE: (TTEntry | null)[] = new Array(SIZE).fill(null);
let GENERATION = 0;

export function ttClear() {
  TABLE = new Array(SIZE).fill(null);
  GENERATION = 0;
}

export function ttBumpGeneration() {
  GENERATION = (GENERATION + 1) | 0;
}

export function ttProbe(key: number): TTEntry | null {
  const e = TABLE[key & MASK];
  if (e && e.key === key) return e;
  return null;
}

export function ttStore(
  key: number,
  depth: number,
  score: number,
  flag: TTFlag,
  bestRow = -1,
  bestCol = -1
) {
  const idx = key & MASK;
  const cur = TABLE[idx];
  // Prefer entries from current generation or deeper
  if (cur && cur.age === GENERATION && cur.depth > depth) return;
  TABLE[idx] = { key, depth, score, flag, bestRow, bestCol, age: GENERATION };
}

export function ttSize(): number {
  return SIZE;
}

export function ttUsage(): number {
  let n = 0;
  for (const e of TABLE) if (e) n++;
  return n;
}
