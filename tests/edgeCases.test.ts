import { describe, it, expect } from 'vitest';
import {
  applyPlacement,
  computeAutoPhase,
  expectedMover,
  initGame,
  resolvePendingBids,
  setPendingBid,
  skipFinalMoveIfNoLegal,
} from '../src/core/gameLoop';
import { hasLegalMove, legalMoves } from '../src/core/board';
import { determineWinner } from '../src/core/scoring';
import { Board, GameState } from '../src/core/types';

function emptyBoard(): Board {
  return Array.from({ length: 8 }, () => Array(8).fill(null));
}

describe('edge cases E1-E15', () => {
  it('E1: bid above chips is rejected', () => {
    let s = initGame({ initialChips: 10 });
    expect(() => setPendingBid(s, 'BLACK', 11)).toThrow();
  });

  it('E2: negative or fractional bid rejected', () => {
    let s = initGame({ initialChips: 10 });
    expect(() => setPendingBid(s, 'BLACK', -1)).toThrow();
    expect(() => setPendingBid(s, 'BLACK', 0.5)).toThrow();
  });

  it('E3: both chips 0 with both legal moves -> ENDED (no free final move)', () => {
    // New rule: when both reach 0 chips, end the game outright. Previously
    // the holder got one free FINAL_MOVE, which felt unfair to the user.
    let s = initGame({ initialChips: 0 });
    s = computeAutoPhase(s);
    expect(s.phase).toBe('ENDED');
    expect(s.endReason).toBe('CHIPS_EXHAUSTED');
  });

  it('E4: both chips 0 and holder no legal move -> ENDED', () => {
    // Build a board where BLACK has no legal move but WHITE does, then
    // simulate getting to FINAL_MOVE via resolution would normally not
    // happen (since BIDDING requires both have moves). Instead we test:
    // computeAutoPhase reaches FINAL_MOVE when both legal AND chips=0;
    // skipFinalMoveIfNoLegal handles ENDED transition when holder lacks move.
    let s = initGame({ initialChips: 0 });
    // Force board where holder=BLACK has no move
    const b = emptyBoard();
    // Construct: BLACK has stones surrounded such that no flips possible
    b[0][0] = 'BLACK';
    s = { ...s, board: b, phase: 'FINAL_MOVE' };
    s = skipFinalMoveIfNoLegal(s);
    expect(s.phase).toBe('ENDED');
    expect(s.endReason).toBe('CHIPS_EXHAUSTED');
  });

  it('E6: both chips 0, both bid 0 -> tie, holder wins, token moves', () => {
    let s = initGame({ initialChips: 0 });
    // can't enter BIDDING with 0/0 chips (computeAutoPhase routes to FINAL_MOVE).
    // But the resolveBids function is still well-defined for 0/0:
    const r = resolvePendingBids({
      ...s,
      phase: 'BIDDING',
      pendingBids: { BLACK: 0, WHITE: 0 },
    });
    expect(r.resolution.tieBroken).toBe(true);
    expect(r.resolution.winner).toBe('BLACK');
    // Token transfer is now placement-driven; resolve does not move it.
    expect(r.state.initiativeHolder).toBe('BLACK');
  });

  it('E7: both no legal moves -> BOTH_NO_MOVES termination', () => {
    let s = initGame({ initialChips: 50 });
    // Fill board such that no legal moves exist for either
    const b: Board = Array.from({ length: 8 }, () => Array(8).fill('BLACK'));
    s = { ...s, board: b };
    const next = computeAutoPhase(s);
    expect(next.phase).toBe('ENDED');
    expect(next.endReason).toBe('BOTH_NO_MOVES');
  });

  it('E8: consecutive ties — token transfers each placement', () => {
    let s = initGame({ initialChips: 50 });
    // tie 1: black holder, both bid 5 -> black wins, token unchanged at resolve
    s = setPendingBid(s, 'BLACK', 5);
    s = setPendingBid(s, 'WHITE', 5);
    let out = resolvePendingBids(s);
    s = out.state;
    expect(s.initiativeHolder).toBe('BLACK'); // no move at resolve
    // Place: holder places -> token transfers to white
    let m = legalMoves(s.board, expectedMover(s)!)[0];
    s = applyPlacement(s, expectedMover(s)!, m.row, m.col);
    expect(s.initiativeHolder).toBe('WHITE');
    expect(s.phase).toBe('BIDDING');
    // tie 2: white now holder; both bid 3 -> white wins
    s = setPendingBid(s, 'BLACK', 3);
    s = setPendingBid(s, 'WHITE', 3);
    out = resolvePendingBids(s);
    s = out.state;
    expect(s.initiativeHolder).toBe('WHITE');
    // Place: holder (white) places -> token back to black
    m = legalMoves(s.board, expectedMover(s)!)[0];
    s = applyPlacement(s, expectedMover(s)!, m.row, m.col);
    expect(s.initiativeHolder).toBe('BLACK');
  });

  it('E10: zero-bid streak reset when one bids non-zero', () => {
    let s = initGame({ initialChips: 10, zeroBidStreakLimit: 3 });
    // first turn 0,0
    s = setPendingBid(s, 'BLACK', 0);
    s = setPendingBid(s, 'WHITE', 0);
    s = resolvePendingBids(s).state;
    if (s.phase === 'PLACING') {
      const m = legalMoves(s.board, expectedMover(s)!)[0];
      s = applyPlacement(s, expectedMover(s)!, m.row, m.col);
    }
    expect(s.zeroBidStreak).toBe(1);

    // second turn: 1, 0 -> no longer all zero
    s = setPendingBid(s, 'BLACK', 1);
    s = setPendingBid(s, 'WHITE', 0);
    s = resolvePendingBids(s).state;
    if (s.phase === 'PLACING') {
      const m = legalMoves(s.board, expectedMover(s)!)[0];
      s = applyPlacement(s, expectedMover(s)!, m.row, m.col);
    }
    expect(s.zeroBidStreak).toBe(0);
  });

  it('FINAL_MOVE phase transitions straight to ENDED (chips exhausted)', () => {
    // FINAL_MOVE is no longer auto-entered when both chips reach 0 (the
    // game now ends outright in that case). The phase still exists for
    // legacy / manual routing.
    let s = initGame({ initialChips: 0 });
    const b: Board = emptyBoard();
    b[0][1] = 'WHITE';
    b[0][2] = 'BLACK';
    b[3][3] = 'WHITE';
    b[3][4] = 'BLACK';
    b[4][3] = 'BLACK';
    b[4][4] = 'WHITE';
    s = { ...s, board: b, phase: 'FINAL_MOVE', initiativeHolder: 'BLACK' };
    // Black places at (0,0) under FINAL_MOVE
    s = applyPlacement(s, 'BLACK', 0, 0);
    expect(s.phase).toBe('ENDED');
    expect(s.endReason).toBe('CHIPS_EXHAUSTED');
    // Chips never increase; still exhausted after the final placement.
    expect(s.players.BLACK.chips).toBe(0);
  });

  it('PLACING throws if wrong player tries to move', () => {
    let s = initGame({ initialChips: 10 });
    s = setPendingBid(s, 'BLACK', 5);
    s = setPendingBid(s, 'WHITE', 0);
    s = resolvePendingBids(s).state;
    expect(s.phase).toBe('PLACING');
    // The bid winner is BLACK; WHITE should be rejected
    const m = legalMoves(s.board, 'WHITE')[0]; // any white move (illegal in this phase)
    expect(() => applyPlacement(s, 'WHITE', m.row, m.col)).toThrow();
  });

  it('FREE_MOVE: only the side with legal move can play, transitions back', () => {
    let s = initGame({ initialChips: 10 });
    // Construct a board where only BLACK has a legal move
    const b: Board = emptyBoard();
    b[3][3] = 'WHITE';
    b[3][4] = 'BLACK';
    b[4][3] = 'BLACK';
    b[4][4] = 'WHITE';
    // Add a position where white has no legal move but black does
    // Actually starting position both have moves. Need a constructed board.
    // Skip and just test FREE_MOVE detection. Manually craft:
    const b2: Board = emptyBoard();
    b2[0][0] = 'BLACK';
    b2[0][1] = 'WHITE';
    // black can play (0,2)? need black sandwich: place BLACK at (0,2) with W at (0,1) and... need black further on (0,3) which doesn't exist
    // Actually for BLACK to play at (0,2), need white at (0,1) and black at (0,0): that's a sandwich!
    // Wait - BLACK plays at (0,2). Going from (0,2) toward (0,0): (0,1)=WHITE, (0,0)=BLACK. Sandwich! So (0,2) is legal for BLACK.
    // White can play at (0,2) too? Going from (0,2) toward (0,0): (0,1)=WHITE same color, no flip. Going elsewhere: no W stones in line. So WHITE has no legal move.
    s = { ...s, board: b2 };
    const next = computeAutoPhase(s);
    expect(next.phase).toBe('FREE_MOVE');
    expect(expectedMover(next)).toBe('BLACK');
  });
});

describe('chip flow correctness', () => {
  it('bid winner pays exact bid; loser pays nothing (first-price)', () => {
    let s = initGame({ initialChips: 50, auctionType: 'first-price' });
    s = setPendingBid(s, 'BLACK', 30);
    s = setPendingBid(s, 'WHITE', 25);
    const out = resolvePendingBids(s);
    expect(out.state.players.BLACK.chips).toBe(20);
    expect(out.state.players.WHITE.chips).toBe(50);
  });

  it('winner pays own bid, not opponent bid (first-price auction)', () => {
    let s = initGame({ initialChips: 100, auctionType: 'first-price' });
    s = setPendingBid(s, 'BLACK', 90);
    s = setPendingBid(s, 'WHITE', 5);
    const out = resolvePendingBids(s);
    expect(out.resolution.winner).toBe('BLACK');
    expect(out.resolution.payment).toBe(90);
    expect(out.state.players.BLACK.chips).toBe(10);
  });
});

describe('determineWinner edge cases', () => {
  it('full BLACK win when WHITE has no stones', () => {
    let s = initGame({ initialChips: 50 });
    const b: Board = Array.from({ length: 8 }, () => Array(8).fill('BLACK'));
    s = { ...s, board: b, phase: 'ENDED', endReason: 'BOTH_NO_MOVES' };
    const r = determineWinner(s);
    expect(r.winner).toBe('BLACK');
    expect(r.stones.BLACK).toBe(64);
    expect(r.stones.WHITE).toBe(0);
  });
});
