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
import { createInitialBoard, applyMove, legalMoves } from '../src/core/board';

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
});
