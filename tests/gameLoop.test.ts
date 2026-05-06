import { describe, it, expect } from 'vitest';
import {
  applyPlacement,
  computeAutoPhase,
  expectedMover,
  initGame,
  resolvePendingBids,
  setPendingBid,
} from '../src/core/gameLoop';
import { legalMoves } from '../src/core/board';

describe('game loop basics', () => {
  it('initGame produces BIDDING phase with default chips', () => {
    const s = initGame();
    expect(s.phase).toBe('BIDDING');
    expect(s.players.BLACK.chips).toBe(200);
    expect(s.players.WHITE.chips).toBe(200);
    expect(s.initiativeHolder).toBe('BLACK');
  });

  it('higher bid wins; payment deducted from winner', () => {
    let s = initGame({ auctionType: 'first-price' });
    s = setPendingBid(s, 'BLACK', 30);
    s = setPendingBid(s, 'WHITE', 20);
    const out = resolvePendingBids(s);
    expect(out.resolution.winner).toBe('BLACK');
    expect(out.state.players.BLACK.chips).toBe(170);
    expect(out.state.players.WHITE.chips).toBe(200);
    expect(out.state.phase).toBe('PLACING');
    expect(out.state.history).toHaveLength(1);
  });

  it('tie: holder wins, token transfers on placement, payment deducted', () => {
    let s = initGame();
    s = setPendingBid(s, 'BLACK', 10);
    s = setPendingBid(s, 'WHITE', 10);
    const out = resolvePendingBids(s);
    expect(out.resolution.winner).toBe('BLACK');
    expect(out.resolution.tieBroken).toBe(true);
    // Token unchanged at resolve under placement-driven rule.
    expect(out.state.initiativeHolder).toBe('BLACK');
    expect(out.state.players.BLACK.chips).toBe(190);
    // Place black's stone - holder placed, so token moves to white.
    let s2 = out.state;
    const m = legalMoves(s2.board, 'BLACK')[0];
    s2 = applyPlacement(s2, 'BLACK', m.row, m.col);
    expect(s2.initiativeHolder).toBe('WHITE');
  });

  it('non-holder places: token stays with holder', () => {
    let s = initGame(); // holder = BLACK
    s = setPendingBid(s, 'BLACK', 0);
    s = setPendingBid(s, 'WHITE', 5);
    s = resolvePendingBids(s).state;
    expect(s.initiativeHolder).toBe('BLACK'); // unchanged at resolve
    // White places (non-holder), token stays with black
    const m = legalMoves(s.board, 'WHITE')[0];
    s = applyPlacement(s, 'WHITE', m.row, m.col);
    expect(s.initiativeHolder).toBe('BLACK');
  });

  it('holder places (unequal bids): token transfers', () => {
    let s = initGame(); // holder = BLACK
    s = setPendingBid(s, 'BLACK', 10);
    s = setPendingBid(s, 'WHITE', 5);
    s = resolvePendingBids(s).state;
    expect(s.initiativeHolder).toBe('BLACK');
    const m = legalMoves(s.board, 'BLACK')[0];
    s = applyPlacement(s, 'BLACK', m.row, m.col);
    expect(s.initiativeHolder).toBe('WHITE');
  });

  it('placement transitions back to BIDDING and updates board', () => {
    let s = initGame();
    s = setPendingBid(s, 'BLACK', 5);
    s = setPendingBid(s, 'WHITE', 0);
    const out = resolvePendingBids(s);
    s = out.state;
    expect(s.phase).toBe('PLACING');
    const moves = legalMoves(s.board, 'BLACK');
    s = applyPlacement(s, 'BLACK', moves[0].row, moves[0].col);
    expect(s.phase).toBe('BIDDING');
    expect(s.board[moves[0].row][moves[0].col]).toBe('BLACK');
  });

  it('cannot place out of phase', () => {
    const s = initGame();
    expect(() => applyPlacement(s, 'BLACK', 2, 3)).toThrow();
  });

  it('expectedMover correct in PLACING/FINAL_MOVE', () => {
    let s = initGame();
    s = setPendingBid(s, 'BLACK', 5);
    s = setPendingBid(s, 'WHITE', 3);
    s = resolvePendingBids(s).state;
    expect(s.phase).toBe('PLACING');
    expect(expectedMover(s)).toBe('BLACK');
  });

  it('cannot bid twice', () => {
    let s = initGame();
    s = setPendingBid(s, 'BLACK', 5);
    expect(() => setPendingBid(s, 'BLACK', 6)).toThrow();
  });
});

describe('chip exhaustion', () => {
  it('triggers FINAL_MOVE when bid resolution makes both 0 (first-price)', () => {
    let s = initGame({ initialChips: 5, auctionType: 'first-price' });
    // black has 5, white has 5, black bids 5, white bids 5 (tie -> black wins, pays 5)
    s = setPendingBid(s, 'BLACK', 5);
    s = setPendingBid(s, 'WHITE', 5);
    const out = resolvePendingBids(s);
    s = out.state;
    expect(s.players.BLACK.chips).toBe(0);
    expect(s.players.WHITE.chips).toBe(5); // white kept his
    // not both zero, so PLACING
    expect(s.phase).toBe('PLACING');
  });

  it('FINAL_MOVE when both chips become 0 simultaneously', () => {
    // Setup: chips=5 vs 5; black bids 5, white bids 5 (tie BLACK wins, pays 5).
    // Black 0, white 5. Not 0-0 yet.
    // Need a scenario where one side already has 0 going into bidding.
    let s = initGame({ initialChips: 5 });
    // hack: set white chips to 0, black bids 5 -> black wins paying 5 -> 0-0
    s = { ...s, players: { ...s.players, WHITE: { ...s.players.WHITE, chips: 0 } } };
    s = setPendingBid(s, 'BLACK', 5);
    s = setPendingBid(s, 'WHITE', 0);
    const out = resolvePendingBids(s);
    s = out.state;
    expect(s.players.BLACK.chips).toBe(0);
    expect(s.players.WHITE.chips).toBe(0);
    expect(s.phase).toBe('FINAL_MOVE');
    expect(s.endReason).toBe('CHIPS_EXHAUSTED');
  });
});

describe('computeAutoPhase', () => {
  it('keeps BIDDING when both have moves and chips', () => {
    const s = initGame();
    const next = computeAutoPhase(s);
    expect(next.phase).toBe('BIDDING');
  });

  it('returns FINAL_MOVE when both 0 chips and both have moves', () => {
    let s = initGame({ initialChips: 0 });
    s = computeAutoPhase(s);
    expect(s.phase).toBe('FINAL_MOVE');
  });
});
