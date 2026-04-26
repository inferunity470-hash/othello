import { describe, it, expect } from 'vitest';
import {
  initGame,
  setPendingBid,
  resolvePendingBids,
  applyPlacement,
  expectedMover,
} from '../src/core/gameLoop';
import { resolveBids } from '../src/core/bidding';
import { legalMoves } from '../src/core/board';
import { initialChipsFor } from '../src/core/types';

describe('handicap (asymmetric initial chips)', () => {
  it('initialChips object yields different starting chips', () => {
    const s = initGame({ initialChips: { BLACK: 100, WHITE: 250 } });
    expect(s.players.BLACK.chips).toBe(100);
    expect(s.players.WHITE.chips).toBe(250);
  });

  it('initialChipsFor helper handles both forms', () => {
    expect(initialChipsFor({ ...initGame().options, initialChips: 200 }, 'BLACK')).toBe(200);
    expect(
      initialChipsFor(
        { ...initGame().options, initialChips: { BLACK: 50, WHITE: 300 } },
        'WHITE'
      )
    ).toBe(300);
  });

  it('handicap game proceeds normally', () => {
    let s = initGame({ initialChips: { BLACK: 50, WHITE: 200 } });
    s = setPendingBid(s, 'BLACK', 5);
    s = setPendingBid(s, 'WHITE', 50);
    const out = resolvePendingBids(s);
    expect(out.resolution.winner).toBe('WHITE');
    expect(out.resolution.payment).toBe(50);
    expect(out.state.players.WHITE.chips).toBe(150);
    expect(out.state.players.BLACK.chips).toBe(50);
  });
});

describe('second-price (Vickrey) auction', () => {
  it('winner pays loser bid amount, not own', () => {
    const s = initGame({ auctionType: 'second-price' });
    const r = resolveBids(s, { BLACK: 30, WHITE: 20 });
    expect(r.winner).toBe('BLACK');
    expect(r.payment).toBe(20); // pays opponent bid
    expect(r.tieBroken).toBe(false);
  });

  it('white winning second-price', () => {
    const s = initGame({ auctionType: 'second-price' });
    const r = resolveBids(s, { BLACK: 5, WHITE: 100 });
    expect(r.winner).toBe('WHITE');
    expect(r.payment).toBe(5);
  });

  it('tie still pays own bid (= opponent), token transfers', () => {
    const s = initGame({ auctionType: 'second-price' });
    const r = resolveBids(s, { BLACK: 50, WHITE: 50 });
    expect(r.winner).toBe('BLACK');
    expect(r.payment).toBe(50);
    expect(r.tieBroken).toBe(true);
    expect(r.newInitiativeHolder).toBe('WHITE');
  });

  it('full second-price game completes', () => {
    let s = initGame({ initialChips: 30, auctionType: 'second-price' });
    let safety = 200;
    while (s.phase !== 'ENDED' && safety-- > 0) {
      if (s.phase === 'BIDDING') {
        // simple bid: each side bids min(chips, 5)
        s = setPendingBid(s, 'BLACK', Math.min(5, s.players.BLACK.chips));
        s = setPendingBid(s, 'WHITE', Math.min(3, s.players.WHITE.chips));
        const out = resolvePendingBids(s);
        s = out.state;
        if (s.phase === 'PLACING' || s.phase === 'FINAL_MOVE') {
          const m = legalMoves(s.board, expectedMover(s)!)[0];
          s = applyPlacement(s, expectedMover(s)!, m.row, m.col);
        }
      } else if (s.phase === 'FREE_MOVE') {
        const m = legalMoves(s.board, expectedMover(s)!)[0];
        s = applyPlacement(s, expectedMover(s)!, m.row, m.col);
      } else if (s.phase === 'FINAL_MOVE') {
        const m = legalMoves(s.board, s.initiativeHolder);
        if (m.length === 0) break;
        s = applyPlacement(s, s.initiativeHolder, m[0].row, m[0].col);
      }
    }
    expect(s.phase).toBe('ENDED');
  });
});
