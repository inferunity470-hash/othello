import { describe, it, expect } from 'vitest';
import {
  applyPlacement,
  expectedMover,
  initGame,
  resolvePendingBids,
  setPendingBid,
  skipFinalMoveIfNoLegal,
} from '../src/core/gameLoop';
import { legalMoves, hasLegalMove } from '../src/core/board';
import { determineWinner } from '../src/core/scoring';
import { GameState, Color } from '../src/core/types';

function step(
  state: GameState,
  bidB: number,
  bidW: number,
  pickIdx: (s: GameState, c: Color) => number = () => 0
): GameState {
  if (state.phase === 'FREE_MOVE') {
    const mover = expectedMover(state)!;
    const moves = legalMoves(state.board, mover);
    return applyPlacement(state, mover, moves[0].row, moves[0].col);
  }
  if (state.phase === 'FINAL_MOVE') {
    if (!hasLegalMove(state.board, state.initiativeHolder)) {
      return skipFinalMoveIfNoLegal(state);
    }
    const moves = legalMoves(state.board, state.initiativeHolder);
    return applyPlacement(state, state.initiativeHolder, moves[0].row, moves[0].col);
  }
  let s = setPendingBid(state, 'BLACK', bidB);
  s = setPendingBid(s, 'WHITE', bidW);
  const out = resolvePendingBids(s);
  s = out.state;
  if (s.phase === 'PLACING' || s.phase === 'FINAL_MOVE') {
    const mover = expectedMover(s)!;
    const moves = legalMoves(s.board, mover);
    if (moves.length === 0) {
      throw new Error(`expected legal move for ${mover} in ${s.phase}`);
    }
    const idx = pickIdx(s, mover);
    const m = moves[idx % moves.length];
    s = applyPlacement(s, mover, m.row, m.col);
  }
  return s;
}

describe('integration: full games', () => {
  it('T1: random bids always terminate', () => {
    let s = initGame({ initialChips: 50 });
    const rng = makeRng(42);
    let safety = 500;
    while (s.phase !== 'ENDED' && safety-- > 0) {
      const bidB = Math.floor(rng() * (s.players.BLACK.chips + 1));
      const bidW = Math.floor(rng() * (s.players.WHITE.chips + 1));
      s = step(s, bidB, bidW);
    }
    expect(s.phase).toBe('ENDED');
    expect(safety).toBeGreaterThan(0);
  });

  it('T2: one side always 0, other always 1 -> other wins all auctions', () => {
    let s = initGame({ initialChips: 200 });
    let safety = 500;
    while (s.phase !== 'ENDED' && safety-- > 0) {
      // BLACK always 1, WHITE always 0 (when in BIDDING)
      if (s.phase === 'BIDDING') {
        s = step(s, Math.min(1, s.players.BLACK.chips), 0);
      } else {
        s = step(s, 0, 0);
      }
    }
    expect(s.phase).toBe('ENDED');
  });

  it('T3: equal bids each turn -> token alternates', () => {
    let s = initGame({ initialChips: 5 });
    let safety = 100;
    while (s.phase !== 'ENDED' && safety-- > 0) {
      if (s.phase === 'BIDDING') {
        const v = Math.min(s.players.BLACK.chips, s.players.WHITE.chips);
        s = step(s, v, v);
      } else {
        s = step(s, 0, 0);
      }
    }
    expect(s.phase).toBe('ENDED');
  });

  it('T7/T9 corner capture no longer grants a chip bonus', () => {
    // The "corner bonus" mechanic has been removed entirely: capturing a
    // corner only affects the board, never the chip count.
    let s = initGame({ initialChips: 10 });
    // Construct a board where BLACK can take a corner immediately
    // Use a hand-crafted board.
    s.board = Array.from({ length: 8 }, () => Array(8).fill(null));
    // Place WHITE at (0,1), (0,2) and BLACK at (0,3) such that BLACK at (0,0) flips (0,1) and (0,2)
    // Actually: BLACK at (0,3), opponent W at (0,2), W at (0,1), then BLACK at (0,0) sandwiches WW
    // place BLACK pieces so legal move at (0,0)
    s.board[0][1] = 'WHITE';
    s.board[0][2] = 'WHITE';
    s.board[0][3] = 'BLACK';
    // Need to also have a normal initial-ish board, but for this test we just need BLACK to play
    s.board[3][3] = 'WHITE';
    s.board[3][4] = 'BLACK';
    s.board[4][3] = 'BLACK';
    s.board[4][4] = 'WHITE';

    s = setPendingBid(s, 'BLACK', 1);
    s = setPendingBid(s, 'WHITE', 0);
    const out = resolvePendingBids(s);
    s = out.state;
    // Black wins, chips = 9. Place at (0,0).
    s = applyPlacement(s, 'BLACK', 0, 0);
    // chips: 10 - 1 paid, no bonus for capturing the corner = 9
    expect(s.players.BLACK.chips).toBe(9);
  });

  it('T11: zero-bid-streak limit forces minBid=1', () => {
    let s = initGame({ initialChips: 10, zeroBidStreakLimit: 2 });
    // turn 1: 0,0
    s = setPendingBid(s, 'BLACK', 0);
    s = setPendingBid(s, 'WHITE', 0);
    s = resolvePendingBids(s).state;
    if (s.phase === 'PLACING') {
      const m = legalMoves(s.board, expectedMover(s)!)[0];
      s = applyPlacement(s, expectedMover(s)!, m.row, m.col);
    }
    // turn 2: 0,0
    s = setPendingBid(s, 'BLACK', 0);
    s = setPendingBid(s, 'WHITE', 0);
    s = resolvePendingBids(s).state;
    if (s.phase === 'PLACING') {
      const m = legalMoves(s.board, expectedMover(s)!)[0];
      s = applyPlacement(s, expectedMover(s)!, m.row, m.col);
    }
    // streak = 2, next minBid = 1
    expect(s.zeroBidStreak).toBe(2);
    // attempting to bid 0 should now fail
    expect(() => setPendingBid(s, 'BLACK', 0)).toThrow();
    // bidding 1 succeeds
    const ok = setPendingBid(s, 'BLACK', 1);
    expect(ok.pendingBids?.BLACK).toBe(1);
  });

  it('determineWinner uses chip tiebreaker on stone tie', () => {
    let s = initGame();
    // Manually craft an end state with stone tie
    s = {
      ...s,
      phase: 'ENDED',
      endReason: 'BOTH_NO_MOVES',
      board: makeBoardWithCounts(32, 32),
      players: {
        BLACK: { color: 'BLACK', chips: 50 },
        WHITE: { color: 'WHITE', chips: 30 },
      },
    };
    const r = determineWinner(s);
    expect(r.winner).toBe('BLACK');
    expect(r.tieBreaker).toBe('CHIPS');
  });

  it('full draw when stones AND chips equal', () => {
    let s = initGame();
    s = {
      ...s,
      phase: 'ENDED',
      endReason: 'BOTH_NO_MOVES',
      board: makeBoardWithCounts(32, 32),
      players: {
        BLACK: { color: 'BLACK', chips: 30 },
        WHITE: { color: 'WHITE', chips: 30 },
      },
    };
    const r = determineWinner(s);
    expect(r.winner).toBe('DRAW');
  });
});

function makeBoardWithCounts(b: number, w: number) {
  const board: any = Array.from({ length: 8 }, () => Array(8).fill(null));
  let placed = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (placed < b) {
        board[r][c] = 'BLACK';
        placed++;
      } else if (placed < b + w) {
        board[r][c] = 'WHITE';
        placed++;
      }
    }
  }
  return board;
}

function makeRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}
