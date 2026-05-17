/**
 * LMP staged feature flag (Codex T13) tests. The feature defaults off;
 * verify that ONI_LMP=1 still returns a legal move on the initial board
 * and matches the move count expectations.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { strongSearch } from '../src/core/ai/search';
import { ttClear } from '../src/core/ai/tt';
import { createInitialBoard, legalMoves } from '../src/core/board';

describe('LMP staged (ONI_LMP feature flag)', () => {
  let originalFlag: string | undefined;

  beforeEach(() => {
    originalFlag = process.env.ONI_LMP;
    ttClear();
  });
  afterEach(() => {
    if (originalFlag === undefined) delete process.env.ONI_LMP;
    else process.env.ONI_LMP = originalFlag;
  });

  it('default-off: strongSearch returns a legal move on initial board', () => {
    delete process.env.ONI_LMP;
    const b = createInitialBoard();
    const r = strongSearch(b, 'BLACK', { maxDepth: 4, exactEndgameEmpties: 0 });
    expect(r.move).toBeDefined();
    const lm = legalMoves(b, 'BLACK');
    expect(lm.some(m => m.row === r.move!.row && m.col === r.move!.col)).toBe(true);
  });

  it('Stage 1 (ONI_LMP=1): strongSearch still returns a legal move on initial board', () => {
    process.env.ONI_LMP = '1';
    const b = createInitialBoard();
    const r = strongSearch(b, 'BLACK', { maxDepth: 4, exactEndgameEmpties: 0 });
    expect(r.move).toBeDefined();
    const lm = legalMoves(b, 'BLACK');
    expect(lm.some(m => m.row === r.move!.row && m.col === r.move!.col)).toBe(true);
  });

  it('Stage 2 (ONI_LMP=2): strongSearch still returns a legal move on initial board', () => {
    process.env.ONI_LMP = '2';
    const b = createInitialBoard();
    const r = strongSearch(b, 'BLACK', { maxDepth: 4, exactEndgameEmpties: 0 });
    expect(r.move).toBeDefined();
    const lm = legalMoves(b, 'BLACK');
    expect(lm.some(m => m.row === r.move!.row && m.col === r.move!.col)).toBe(true);
  });
});
