/**
 * Edge Pattern (Codex T12) tests. The feature is gated behind
 * ONI_EDGE_PATTERN — these tests exercise the underlying
 * `edgePatternScore` function directly (always available) and verify
 * the negamax antisymmetry needed by aiEvalSymmetry-style tests.
 */
import { describe, it, expect } from 'vitest';
import { edgePatternScore } from '../src/core/ai/eval';
import { Board, Color } from '../src/core/types';
import { createInitialBoard } from '../src/core/board';

function emptyBoard(): Board {
  return Array.from({ length: 8 }, () =>
    Array.from({ length: 8 }, () => null as Color | null)
  );
}

describe('edgePatternScore', () => {
  it('is zero on an empty board', () => {
    const b = emptyBoard();
    expect(edgePatternScore(b, 'BLACK')).toBe(0);
    expect(edgePatternScore(b, 'WHITE')).toBe(0);
  });

  it('is zero on the standard 4-stone opening (symmetric)', () => {
    const b = createInitialBoard();
    expect(edgePatternScore(b, 'BLACK')).toBe(0);
    expect(edgePatternScore(b, 'WHITE')).toBe(0);
  });

  it('is antisymmetric across all 4 corners (BLACK = -WHITE)', () => {
    const b = emptyBoard();
    b[0][0] = 'BLACK';
    b[0][7] = 'BLACK';
    b[7][0] = 'BLACK';
    b[7][7] = 'BLACK';
    expect(edgePatternScore(b, 'BLACK')).toBe(-edgePatternScore(b, 'WHITE'));
    expect(edgePatternScore(b, 'BLACK')).toBeGreaterThan(0);
  });

  it('is antisymmetric on mixed-edge configurations', () => {
    const b = emptyBoard();
    b[0][0] = 'BLACK';
    b[0][1] = 'WHITE';
    b[0][2] = 'BLACK';
    b[3][0] = 'WHITE';
    b[7][7] = 'BLACK';
    expect(edgePatternScore(b, 'BLACK')).toBe(-edgePatternScore(b, 'WHITE'));
  });

  it('rewards owning a corner more than owning the same C-square alone', () => {
    const cornerOnly = emptyBoard();
    cornerOnly[0][0] = 'BLACK';
    const cSquareOnly = emptyBoard();
    cSquareOnly[0][1] = 'BLACK';
    expect(edgePatternScore(cornerOnly, 'BLACK')).toBeGreaterThan(
      edgePatternScore(cSquareOnly, 'BLACK')
    );
  });
});
