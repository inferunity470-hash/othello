import { describe, it, expect } from 'vitest';
import {
  applyMove,
  countStones,
  createInitialBoard,
  detectCornerGain,
  hasLegalMove,
  isCornerSquare,
  legalMoves,
} from '../src/core/board';
import { Board } from '../src/core/types';

describe('board basics', () => {
  it('initial board has 4 stones in a cross pattern', () => {
    const b = createInitialBoard();
    expect(b[3][3]).toBe('WHITE');
    expect(b[3][4]).toBe('BLACK');
    expect(b[4][3]).toBe('BLACK');
    expect(b[4][4]).toBe('WHITE');
    const stones = countStones(b);
    expect(stones.BLACK).toBe(2);
    expect(stones.WHITE).toBe(2);
  });

  it('legalMoves returns 4 standard openings for BLACK', () => {
    const b = createInitialBoard();
    const moves = legalMoves(b, 'BLACK');
    expect(moves).toHaveLength(4);
    // sort and compare
    const sorted = moves.map(m => `${m.row},${m.col}`).sort();
    expect(sorted).toEqual(['2,3', '3,2', '4,5', '5,4']);
  });

  it('applyMove flips correctly for a standard opening', () => {
    const b = createInitialBoard();
    const { newBoard, flipped } = applyMove(b, 'BLACK', 2, 3);
    expect(newBoard[2][3]).toBe('BLACK');
    expect(newBoard[3][3]).toBe('BLACK'); // flipped
    expect(flipped).toEqual([[3, 3]]);
  });

  it('applyMove throws on illegal move', () => {
    const b = createInitialBoard();
    expect(() => applyMove(b, 'BLACK', 0, 0)).toThrow();
  });

  it('hasLegalMove correctly reports both colors at start', () => {
    const b = createInitialBoard();
    expect(hasLegalMove(b, 'BLACK')).toBe(true);
    expect(hasLegalMove(b, 'WHITE')).toBe(true);
  });

  it('detects 8-direction sandwich', () => {
    // Construct a board with all 8 sandwiches around (3,3)
    const b: Board = Array.from({ length: 8 }, () => Array(8).fill(null));
    // place a black at (3,3) target
    // For each direction, place opponent W at neighbor and B at far end
    const setups: Array<[number, number]> = [
      [0, 0],
      [0, 3],
      [0, 6],
      [3, 0],
      [3, 6],
      [6, 0],
      [6, 3],
      [6, 6],
    ];
    const dirs = [
      [-1, -1],
      [-1, 0],
      [-1, 1],
      [0, -1],
      [0, 1],
      [1, -1],
      [1, 0],
      [1, 1],
    ];
    // place B-sandwich-W around an empty (3,3)? Actually let's just test 1 dir at a time
    for (let i = 0; i < dirs.length; i++) {
      const board: Board = Array.from({ length: 8 }, () => Array(8).fill(null));
      const [dr, dc] = dirs[i];
      // empty target at (3,3); opponent at (3+dr,3+dc); my own at (3+2dr,3+2dc)
      board[3 + dr][3 + dc] = 'WHITE';
      board[3 + 2 * dr][3 + 2 * dc] = 'BLACK';
      // need at least 1 own stone on board for the engine; that's ok
      const moves = legalMoves(board, 'BLACK');
      const found = moves.some(m => m.row === 3 && m.col === 3);
      expect(found, `dir ${dr},${dc}`).toBe(true);
    }
  });

  it('detectCornerGain returns 1 when corner becomes mine', () => {
    const before: Board = Array.from({ length: 8 }, () => Array(8).fill(null));
    const after = before.map(r => r.slice());
    after[0][0] = 'BLACK';
    expect(detectCornerGain(before, after, 'BLACK')).toBe(1);
    expect(detectCornerGain(before, after, 'WHITE')).toBe(0);
  });

  it('isCornerSquare', () => {
    expect(isCornerSquare(0, 0)).toBe(true);
    expect(isCornerSquare(0, 7)).toBe(true);
    expect(isCornerSquare(7, 0)).toBe(true);
    expect(isCornerSquare(7, 7)).toBe(true);
    expect(isCornerSquare(3, 3)).toBe(false);
  });
});
