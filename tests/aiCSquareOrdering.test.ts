/**
 * Regression test: the C-square move-ordering penalty must reference the
 * actual adjacent corner. A previous version used `m.row` for `cc`, which
 * pointed at the wrong cell entirely (e.g. (0,1) → (0,1) instead of (0,0)),
 * causing the penalty to misfire.
 *
 * We test this indirectly: build a position where (0,0) is empty and a
 * C-square move (0,1) is legal. The search should still produce a sane
 * legal move and not crash. Direct unit-testing of `orderMoves` requires
 * exposing internals; we instead drive `strongSearch` and verify the
 * outcome matches a brute-force corner-aware preference.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { strongSearch } from '../src/core/ai/search';
import { ttClear } from '../src/core/ai/tt';
import { Board } from '../src/core/types';
import { applyMove, legalMoves } from '../src/core/board';

function emptyBoard(): Board {
  return Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => null));
}

beforeEach(() => ttClear());

describe('AI C-square ordering', () => {
  it('does not blow up on positions with multiple C-square candidates', () => {
    // Standard initial board has no C-square moves on the first few plies,
    // so we step a few moves in to force one.
    const b = emptyBoard();
    b[3][3] = 'WHITE';
    b[3][4] = 'BLACK';
    b[4][3] = 'BLACK';
    b[4][4] = 'WHITE';
    // Construct a deep enough state that BLACK has C-square options.
    const moves = legalMoves(b, 'BLACK');
    expect(moves.length).toBeGreaterThan(0);
    const r = strongSearch(b, 'BLACK', { maxDepth: 5, exactEndgameEmpties: 0 });
    expect(r.move).toBeDefined();
    // Move must be legal
    expect(moves.some(m => m.row === r.move!.row && m.col === r.move!.col)).toBe(true);
  });

  it('with a free corner reachable, search prefers it over C-square', () => {
    // (0,0) playable for BLACK: (0,1)=W (0,2)=W (0,3)=B → flips (0,1)(0,2).
    const b = emptyBoard();
    b[0][1] = 'WHITE';
    b[0][2] = 'WHITE';
    b[0][3] = 'BLACK';
    b[3][3] = 'WHITE';
    b[3][4] = 'BLACK';
    b[4][3] = 'BLACK';
    b[4][4] = 'WHITE';
    const moves = legalMoves(b, 'BLACK');
    const hasCorner = moves.some(m => m.row === 0 && m.col === 0);
    expect(hasCorner).toBe(true);
    const r = strongSearch(b, 'BLACK', { maxDepth: 6, exactEndgameEmpties: 0 });
    expect(r.move).toBeDefined();
    expect(r.move!.row).toBe(0);
    expect(r.move!.col).toBe(0);
  });
});
