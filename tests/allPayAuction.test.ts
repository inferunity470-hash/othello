/**
 * All-pay auction tests:
 *  - resolveBids returns correct payments for both players
 *  - resolvePendingBids deducts from both players' chips
 *  - tied bids in all-pay still award the holder, but BOTH still pay
 *  - second-price and first-price are unaffected
 */
import { describe, it, expect } from 'vitest';
import { resolveBids } from '../src/core/bidding';
import {
  applyPlacement,
  initGame,
  resolvePendingBids,
  setPendingBid,
} from '../src/core/gameLoop';
import { legalMoves } from '../src/core/board';

describe('all-pay auction (resolveBids)', () => {
  it('higher bid wins; both players pay their own bid', () => {
    const s = initGame({ auctionType: 'all-pay' });
    const r = resolveBids(s, { BLACK: 20, WHITE: 10 });
    expect(r.winner).toBe('BLACK');
    expect(r.payment).toBe(20);
    expect(r.payments).toEqual({ BLACK: 20, WHITE: 10 });
  });

  it('white higher wins; both pay', () => {
    const s = initGame({ auctionType: 'all-pay' });
    const r = resolveBids(s, { BLACK: 5, WHITE: 30 });
    expect(r.winner).toBe('WHITE');
    expect(r.payments).toEqual({ BLACK: 5, WHITE: 30 });
  });

  it('zero from both: no chips lost', () => {
    const s = initGame({ auctionType: 'all-pay' });
    const r = resolveBids(s, { BLACK: 0, WHITE: 0 });
    expect(r.payments).toEqual({ BLACK: 0, WHITE: 0 });
    expect(r.tieBroken).toBe(true);
  });

  it('tied positive bids: holder wins; BOTH still pay (key all-pay property)', () => {
    let s = initGame({ auctionType: 'all-pay' });
    s = { ...s, initiativeHolder: 'WHITE' };
    const r = resolveBids(s, { BLACK: 25, WHITE: 25 });
    expect(r.winner).toBe('WHITE'); // holder wins
    expect(r.tieBroken).toBe(true);
    expect(r.payments).toEqual({ BLACK: 25, WHITE: 25 });
  });

  it('first-price unchanged: only winner pays', () => {
    const s = initGame({ auctionType: 'first-price' });
    const r = resolveBids(s, { BLACK: 20, WHITE: 10 });
    expect(r.payments).toEqual({ BLACK: 20, WHITE: 0 });
  });

  it('second-price unchanged: winner pays loser bid; loser pays 0', () => {
    const s = initGame({ auctionType: 'second-price' });
    const r = resolveBids(s, { BLACK: 20, WHITE: 10 });
    expect(r.payments).toEqual({ BLACK: 10, WHITE: 0 });
    expect(r.payment).toBe(10);
  });
});

describe('all-pay auction (gameLoop integration)', () => {
  it('resolvePendingBids deducts from both players in all-pay', () => {
    let s = initGame({ initialChips: 100, auctionType: 'all-pay' });
    expect(s.players.BLACK.chips).toBe(100);
    expect(s.players.WHITE.chips).toBe(100);
    s = setPendingBid(s, 'BLACK', 30);
    s = setPendingBid(s, 'WHITE', 20);
    const out = resolvePendingBids(s);
    expect(out.resolution.winner).toBe('BLACK');
    // Both lose chips: BLACK -30, WHITE -20
    expect(out.state.players.BLACK.chips).toBe(70);
    expect(out.state.players.WHITE.chips).toBe(80);
    // Resolution exposes per-player payments
    expect(out.resolution.payments).toEqual({ BLACK: 30, WHITE: 20 });
  });

  it('first-price still deducts only from the winner', () => {
    let s = initGame({ initialChips: 100, auctionType: 'first-price' });
    s = setPendingBid(s, 'BLACK', 30);
    s = setPendingBid(s, 'WHITE', 20);
    const out = resolvePendingBids(s);
    expect(out.state.players.BLACK.chips).toBe(70);
    expect(out.state.players.WHITE.chips).toBe(100);
  });

  it('all-pay both-zero bid: no chips lost; tie awarded to holder', () => {
    let s = initGame({ initialChips: 100, auctionType: 'all-pay' });
    s = setPendingBid(s, 'BLACK', 0);
    s = setPendingBid(s, 'WHITE', 0);
    const out = resolvePendingBids(s);
    expect(out.state.players.BLACK.chips).toBe(100);
    expect(out.state.players.WHITE.chips).toBe(100);
    expect(out.resolution.winner).toBe('BLACK');
    expect(out.resolution.tieBroken).toBe(true);
  });

  it('all-pay can drive both players to 0 in a single tied all-in', () => {
    let s = initGame({ initialChips: 50, auctionType: 'all-pay' });
    s = setPendingBid(s, 'BLACK', 50);
    s = setPendingBid(s, 'WHITE', 50);
    const out = resolvePendingBids(s);
    expect(out.state.players.BLACK.chips).toBe(0);
    expect(out.state.players.WHITE.chips).toBe(0);
    // The winner (tie → holder = BLACK) still places the turn they paid
    // for; the game ends right after that placement.
    expect(out.state.phase).toBe('PLACING');
    expect(out.resolution.winner).toBe('BLACK');
    const m = legalMoves(out.state.board, 'BLACK')[0];
    const ended = applyPlacement(out.state, 'BLACK', m.row, m.col);
    expect(ended.phase).toBe('ENDED');
    expect(ended.endReason).toBe('CHIPS_EXHAUSTED');
  });
});
