/**
 * Negamax invariant for the new evaluator components: every individual
 * sub-score must satisfy `f(b, BLACK) === -f(b, WHITE)` for any board.
 * This is the foundational property that makes alpha-beta search valid.
 */
import { describe, it, expect } from 'vitest';
import {
  evaluateBoard,
  evaluateBoardWithParity,
  positionalScore,
  mobilityScore,
  cornerControl,
  cornerAdjacentScore,
  frontierScore,
  potentialMobilityScore,
  stableDiscScore,
  parityScore,
  stoneDifference,
} from '../src/core/ai/eval';
import { Board, Color } from '../src/core/types';
import { createInitialBoard, applyMove, legalMoves } from '../src/core/board';

function emptyBoard(): Board {
  return Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => null));
}

function randomBoards(count: number, depth: number): Board[] {
  let seed = 42;
  const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const out: Board[] = [];
  for (let i = 0; i < count; i++) {
    let b = createInitialBoard();
    let mover: Color = 'BLACK';
    for (let d = 0; d < depth; d++) {
      const moves = legalMoves(b, mover);
      if (moves.length === 0) {
        mover = mover === 'BLACK' ? 'WHITE' : 'BLACK';
        continue;
      }
      const m = moves[Math.floor(rand() * moves.length)];
      b = applyMove(b, mover, m.row, m.col).newBoard;
      mover = mover === 'BLACK' ? 'WHITE' : 'BLACK';
    }
    out.push(b);
  }
  return out;
}

describe('eval components: negamax antisymmetry', () => {
  const boards = [emptyBoard(), createInitialBoard(), ...randomBoards(40, 12)];

  for (const fn of [
    positionalScore,
    mobilityScore,
    cornerControl,
    cornerAdjacentScore,
    frontierScore,
    potentialMobilityScore,
    stableDiscScore,
    stoneDifference,
  ] as const) {
    it(`${fn.name}: f(b, BLACK) === -f(b, WHITE)`, () => {
      for (const b of boards) {
        const a = fn(b, 'BLACK');
        const w = fn(b, 'WHITE');
        expect(a).toBeCloseTo(-w, 6);
      }
    });
  }

  it('parityScore: depends on color and side-to-move', () => {
    const b = emptyBoard();
    // Plant a few stones to give a non-zero empty count
    b[3][3] = 'WHITE';
    b[3][4] = 'BLACK';
    b[4][3] = 'BLACK';
    b[4][4] = 'WHITE';
    // empty=60 (even). With BLACK to move, the OTHER side (WHITE) plays
    // last — so `color=WHITE` gets +8.
    expect(parityScore(b, 'WHITE', 'BLACK')).toBe(8);
    expect(parityScore(b, 'BLACK', 'BLACK')).toBe(-8);
    // color=WHITE & to-move=WHITE → BLACK plays last → -8
    expect(parityScore(b, 'WHITE', 'WHITE')).toBe(-8);
  });

  it('evaluateBoard: symmetric across boards', () => {
    for (const b of boards) {
      expect(evaluateBoard(b, 'BLACK')).toBeCloseTo(-evaluateBoard(b, 'WHITE'), 6);
    }
  });

  it('evaluateBoardWithParity: symmetric when sides swap', () => {
    for (const b of boards) {
      // For sideToMove=BLACK: f(BLACK, BLACK) === -f(WHITE, BLACK)
      // (parity adds the same term to color & negates for opponent.)
      const wB = evaluateBoardWithParity(b, 'WHITE', 'BLACK');
      const bB = evaluateBoardWithParity(b, 'BLACK', 'BLACK');
      expect(bB).toBeCloseTo(-wB, 6);
    }
  });
});
