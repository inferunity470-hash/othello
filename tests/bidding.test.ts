import { describe, it, expect } from 'vitest';
import { resolveBids, validateBid, currentMinBid } from '../src/core/bidding';
import { initGame } from '../src/core/gameLoop';

describe('bid resolution', () => {
  it('higher bid wins, no token swap', () => {
    const s = initGame();
    const r = resolveBids(s, { BLACK: 30, WHITE: 20 });
    expect(r.winner).toBe('BLACK');
    expect(r.payment).toBe(30);
    expect(r.tieBroken).toBe(false);
    expect(r.newInitiativeHolder).toBe('BLACK');
  });

  it('white higher wins, no token swap', () => {
    const s = initGame();
    const r = resolveBids(s, { BLACK: 5, WHITE: 100 });
    expect(r.winner).toBe('WHITE');
    expect(r.payment).toBe(100);
    expect(r.tieBroken).toBe(false);
    expect(r.newInitiativeHolder).toBe('BLACK');
  });

  it('tie: holder (BLACK) wins, token moves to WHITE', () => {
    const s = initGame();
    const r = resolveBids(s, { BLACK: 10, WHITE: 10 });
    expect(r.winner).toBe('BLACK');
    expect(r.payment).toBe(10);
    expect(r.tieBroken).toBe(true);
    expect(r.newInitiativeHolder).toBe('WHITE');
  });

  it('tie: holder (WHITE) wins, token moves to BLACK', () => {
    let s = initGame();
    s = { ...s, initiativeHolder: 'WHITE' };
    const r = resolveBids(s, { BLACK: 0, WHITE: 0 });
    expect(r.winner).toBe('WHITE');
    expect(r.payment).toBe(0);
    expect(r.tieBroken).toBe(true);
    expect(r.newInitiativeHolder).toBe('BLACK');
  });
});

describe('bid validation', () => {
  it('rejects negative, non-integer, over-chip bids', () => {
    expect(validateBid(-1, 100, 0).ok).toBe(false);
    expect(validateBid(0.5, 100, 0).ok).toBe(false);
    expect(validateBid(101, 100, 0).ok).toBe(false);
    expect(validateBid(0, 100, 1).ok).toBe(false);
    expect(validateBid(50, 100, 0).ok).toBe(true);
  });
});

describe('zero bid streak min bid', () => {
  it('returns 0 when no limit', () => {
    const s = initGame({ zeroBidStreakLimit: null });
    expect(currentMinBid(s)).toBe(0);
  });

  it('returns 1 when streak meets limit', () => {
    let s = initGame({ zeroBidStreakLimit: 2 });
    s = { ...s, zeroBidStreak: 2 };
    expect(currentMinBid(s)).toBe(1);
  });
});
