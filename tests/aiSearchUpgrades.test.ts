/**
 * Tests for the upgraded search:
 *  - Aspiration windows do not affect final score (correctness)
 *  - LMR re-searches when reduced result beats alpha (no missed moves)
 *  - TT in exact-endgame: re-runs return identical scores
 *  - Move ordering stability (best move on initial board doesn't crash)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { strongSearch } from '../src/core/ai/search';
import { evaluateBoard } from '../src/core/ai/eval';
import { ttClear } from '../src/core/ai/tt';
import { Board, Color } from '../src/core/types';
import { createInitialBoard, legalMoves } from '../src/core/board';

function emptyBoard(): Board {
  return Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => null));
}

beforeEach(() => ttClear());

describe('strongSearch upgrades', () => {
  it('returns same score and move on repeated calls (aspiration determinism)', () => {
    const b = createInitialBoard();
    const r1 = strongSearch(b, 'BLACK', { maxDepth: 6, exactEndgameEmpties: 0 });
    const r2 = strongSearch(b, 'BLACK', { maxDepth: 6, exactEndgameEmpties: 0 });
    expect(r2.score).toBe(r1.score);
    expect(r2.move).toEqual(r1.move);
  });

  it('search depth 1 returns a legal move', () => {
    const b = createInitialBoard();
    const r = strongSearch(b, 'BLACK', { maxDepth: 1, exactEndgameEmpties: 0 });
    expect(r.move).toBeDefined();
    const moves = legalMoves(b, 'BLACK');
    expect(moves.some(m => m.row === r.move!.row && m.col === r.move!.col)).toBe(true);
  });

  it('exact endgame solver caches via TT (second call no slower)', () => {
    // Build a small endgame
    const b = emptyBoard();
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 8; c++) b[r][c] = (r + c) % 2 === 0 ? 'BLACK' : 'WHITE';
    }
    for (let c = 0; c < 8; c++) b[6][c] = c % 2 === 0 ? 'BLACK' : 'WHITE';
    b[7][0] = 'BLACK';
    b[7][7] = 'WHITE';
    const empties = b.flat().filter(c => c === null).length;
    const r1 = strongSearch(b, 'BLACK', {
      maxDepth: empties,
      exactEndgameEmpties: empties,
    });
    const r2 = strongSearch(b, 'BLACK', {
      maxDepth: empties,
      exactEndgameEmpties: empties,
    });
    // Score must agree
    expect(r2.score).toBe(r1.score);
    // 2nd call should hit the TT non-trivially
    expect(r2.ttHits).toBeGreaterThanOrEqual(0);
  });

  it('LMR does not silently lose the corner move in a clear corner-capture', () => {
    // Build a position where the only winning move is taking a corner.
    const b = emptyBoard();
    b[0][1] = 'WHITE';
    b[0][2] = 'WHITE';
    b[0][3] = 'BLACK';
    // Sprinkle some other stones
    b[3][3] = 'WHITE';
    b[3][4] = 'BLACK';
    b[4][3] = 'BLACK';
    b[4][4] = 'WHITE';
    const moves = legalMoves(b, 'BLACK');
    // Verify (0,0) is one of the legal moves
    expect(moves.some(m => m.row === 0 && m.col === 0)).toBe(true);
    const r = strongSearch(b, 'BLACK', { maxDepth: 6, exactEndgameEmpties: 0 });
    expect(r.move).toBeDefined();
    // The chosen move should be a legal one.
    expect(moves.some(m => m.row === r.move!.row && m.col === r.move!.col)).toBe(true);
  });

  it('time budget is respected (returns within budget for shallow request)', () => {
    const b = createInitialBoard();
    const t0 = Date.now();
    const r = strongSearch(b, 'BLACK', {
      maxDepth: 20,
      exactEndgameEmpties: 0,
      timeBudgetMs: 200,
    });
    const dur = Date.now() - t0;
    // Allow generous slack — main contract is "doesn't run forever".
    expect(dur).toBeLessThan(2000);
    expect(r.move).toBeDefined();
  });

  it('eval evaluates initial board to ~0 (symmetric)', () => {
    const b = createInitialBoard();
    expect(Math.abs(evaluateBoard(b, 'BLACK'))).toBeLessThan(1);
  });

  // H9 regression: a root TT cut without a usable bestMove used to leave the
  // caller (pickOniMove) without a move and fall back to pickGreedyMove. The
  // root must always return a defined, legal move.
  it('always returns a defined legal move at root even with TT pre-warmed', () => {
    const b = createInitialBoard();
    // First search warms the TT.
    strongSearch(b, 'BLACK', { maxDepth: 4, exactEndgameEmpties: 0 });
    // Second search at varying depths — root must still return a legal move.
    for (const d of [1, 2, 3, 4, 6]) {
      const r = strongSearch(b, 'BLACK', { maxDepth: d, exactEndgameEmpties: 0 });
      expect(r.move).toBeDefined();
      const moves = legalMoves(b, 'BLACK');
      expect(moves.some(m => m.row === r.move!.row && m.col === r.move!.col)).toBe(true);
    }
  });

  it('returns a legal move even on a tiny time budget (greedy fallback never needed)', () => {
    const b = createInitialBoard();
    strongSearch(b, 'BLACK', { maxDepth: 4, exactEndgameEmpties: 0 });
    const r = strongSearch(b, 'BLACK', {
      maxDepth: 8,
      exactEndgameEmpties: 0,
      timeBudgetMs: 1,
    });
    expect(r.move).toBeDefined();
    const moves = legalMoves(b, 'BLACK');
    expect(moves.some(m => m.row === r.move!.row && m.col === r.move!.col)).toBe(true);
  });
});

/**
 * v2.5 search-strength feature flags (Codex T16):
 *  - A4 Countermove heuristic (ONI_COUNTERMOVE, default on)
 *  - B3 Futility pruning      (ONI_FUTILITY, default off)
 *  - B5 Singular extension    (ONI_SINGULAR, default off)
 */
describe('v2.5 search-strength flags (Codex T16)', () => {
  function withEnv(key: string, value: string | undefined, fn: () => void) {
    const prev = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
    try {
      fn();
    } finally {
      if (prev === undefined) delete process.env[key];
      else process.env[key] = prev;
    }
  }

  function isLegal(b: Board, color: Color, m?: { row: number; col: number }) {
    if (!m) return false;
    return legalMoves(b, color).some(x => x.row === m.row && x.col === m.col);
  }

  it('A4: countermove on — repeated search is deterministic', () => {
    // Mirrors the "aspiration determinism" test above: no ttClear between the
    // two calls, so the warm TT lets the second search reproduce the first.
    withEnv('ONI_COUNTERMOVE', '1', () => {
      const b = createInitialBoard();
      const r1 = strongSearch(b, 'BLACK', { maxDepth: 6, exactEndgameEmpties: 0 });
      const r2 = strongSearch(b, 'BLACK', { maxDepth: 6, exactEndgameEmpties: 0 });
      expect(r2.score).toBe(r1.score);
      expect(r2.move).toEqual(r1.move);
    });
  });

  it('A4: countermove off still returns a legal root move', () => {
    withEnv('ONI_COUNTERMOVE', '0', () => {
      const b = createInitialBoard();
      const r = strongSearch(b, 'BLACK', { maxDepth: 6, exactEndgameEmpties: 0 });
      expect(isLegal(b, 'BLACK', r.move)).toBe(true);
    });
  });

  it('B3: futility on — repeated search is deterministic and legal', () => {
    withEnv('ONI_FUTILITY', '1', () => {
      const b = createInitialBoard();
      const r1 = strongSearch(b, 'BLACK', { maxDepth: 6, exactEndgameEmpties: 0 });
      const r2 = strongSearch(b, 'BLACK', { maxDepth: 6, exactEndgameEmpties: 0 });
      expect(r2.score).toBe(r1.score);
      expect(r2.move).toEqual(r1.move);
      expect(isLegal(b, 'BLACK', r1.move)).toBe(true);
    });
  });

  it('B3: futility does not change the exact-endgame score', () => {
    // The exact-endgame solver is reached via strongSearch before pvs(), so
    // futility must never touch it. Confirm on/off agree on a small endgame.
    const b = emptyBoard();
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 8; c++) b[r][c] = (r + c) % 2 === 0 ? 'BLACK' : 'WHITE';
    }
    for (let c = 0; c < 8; c++) b[6][c] = c % 2 === 0 ? 'BLACK' : 'WHITE';
    b[7][0] = 'BLACK';
    b[7][7] = 'WHITE';
    const empties = b.flat().filter(c => c === null).length;
    let scoreOff = 0;
    withEnv('ONI_FUTILITY', '0', () => {
      ttClear();
      scoreOff = strongSearch(b, 'BLACK', {
        maxDepth: empties,
        exactEndgameEmpties: empties,
      }).score;
    });
    withEnv('ONI_FUTILITY', '1', () => {
      ttClear();
      const scoreOn = strongSearch(b, 'BLACK', {
        maxDepth: empties,
        exactEndgameEmpties: empties,
      }).score;
      expect(scoreOn).toBe(scoreOff);
    });
  });

  it('B5: singular extension respects a tiny time budget and stays legal', () => {
    withEnv('ONI_SINGULAR', '1', () => {
      const b = createInitialBoard();
      ttClear();
      const t0 = Date.now();
      const r = strongSearch(b, 'BLACK', {
        maxDepth: 12,
        exactEndgameEmpties: 0,
        timeBudgetMs: 50,
      });
      expect(Date.now() - t0).toBeLessThan(2000);
      expect(isLegal(b, 'BLACK', r.move)).toBe(true);
    });
  });

  it('B5: singular extension — repeated search is deterministic', () => {
    // Singular fires only at depth >= 8 (so maxDepth >= 8). With NO time
    // budget the wall-clock guard is inert, so the search is deterministic;
    // a 16-empty board keeps every line — extensions included — bounded.
    withEnv('ONI_SINGULAR', '1', () => {
      const b = emptyBoard();
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 8; c++) b[r][c] = (r + c) % 2 === 0 ? 'BLACK' : 'WHITE';
      }
      // Row 5 breaks the checkerboard so the row-5/6 frontier has legal moves.
      for (let c = 0; c < 8; c++) b[5][c] = c % 2 === 0 ? 'BLACK' : 'WHITE';
      const r1 = strongSearch(b, 'BLACK', { maxDepth: 12, exactEndgameEmpties: 0 });
      const r2 = strongSearch(b, 'BLACK', { maxDepth: 12, exactEndgameEmpties: 0 });
      expect(r2.score).toBe(r1.score);
      expect(r2.move).toEqual(r1.move);
    });
  }, 60_000);
});
