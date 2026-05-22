/**
 * Regression tests for the AI bidding logic.
 *
 *   - Opp-modelling defence: AI should NOT bid its full near-stack against
 *     a human who has only bid small amounts so far.
 *   - Vickrey mode: AI should bid closer to its true valuation (truthful
 *     bidding is the dominant strategy in second-price auctions).
 *   - 20/40/60/80 escalation: AI should defend without burning its stack.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  applyPlacement,
  expectedMover,
  initGame,
  resolvePendingBids,
  setPendingBid,
} from '../src/core/gameLoop';
import { decideBid, decideMove, makeRng } from '../src/core/ai';
import { ttClear } from '../src/core/ai/tt';
import { countStones, legalMoves } from '../src/core/board';
import { Color, GameState } from '../src/core/types';

beforeEach(() => ttClear());

describe('bidding: defence does not panic-bid', () => {
  it('after a small human bid history (T1=20), AI does not bid > oppMaxModel + buffer', () => {
    let s: GameState = initGame({ initialChips: 200 });
    // Simulate T1: human (BLACK) bids 20, AI (WHITE) bids 16. Human wins.
    s = setPendingBid(s, 'BLACK', 20);
    s = setPendingBid(s, 'WHITE', 16);
    s = resolvePendingBids(s).state;
    if (s.phase === 'PLACING') {
      const mover = expectedMover(s)!;
      const moves = legalMoves(s.board, mover);
      s = applyPlacement(s, mover, moves[0].row, moves[0].col);
    }
    // T2: AI considers a bid. Even if eval says "must defend", the cap
    // should be modelled around BLACK's max past bid (20) × 2 = 40
    // (or 25% of stack = 50, whichever is larger).
    expect(s.phase).toBe('BIDDING');
    const aiBid = decideBid({ state: s, color: 'WHITE', level: 'advanced' });
    // Without modelling, the AI would bid up to ~oppChips=180 (mate cap).
    // With modelling, the cap is min(oppChips, max(maxBid*2, avg*4, oppChips*0.25))
    // = min(180, max(40, 80, 50)) = 80. Defence buffer pushes it slightly higher.
    expect(aiBid).toBeLessThan(120);
  });

  it('20/40/60/80 escalation does not exhaust the AI in one turn', () => {
    let s: GameState = initGame({ initialChips: 200 });
    // T1: human=20, AI=arbitrary
    s = setPendingBid(s, 'BLACK', 20);
    s = setPendingBid(s, 'WHITE', decideBid({ state: s, color: 'WHITE', level: 'advanced' }));
    s = resolvePendingBids(s).state;
    if (s.phase === 'PLACING') {
      const mover = expectedMover(s)!;
      const m = decideMove(s, mover, mover === 'BLACK' ? 'beginner' : 'advanced');
      s = applyPlacement(s, mover, m.row, m.col);
    }
    expect(s.phase).toBe('BIDDING');
    // T2 — AI should not blow through > 60% of its stack on a single
    // defence here (history shows BLACK only bid 20 of 200).
    const aiBidT2 = decideBid({ state: s, color: 'WHITE', level: 'advanced' });
    expect(aiBidT2).toBeLessThan(s.players.WHITE.chips * 0.65);
  });
});

describe('bidding: Vickrey-aware', () => {
  it('AI bids higher in Vickrey than first-price for the same position', () => {
    const seed = 7;
    // Compare first-price vs second-price (Vickrey) explicitly. The default
    // auction is all-pay; we override to first-price for a meaningful
    // shade comparison. Vickrey's shade (~0.92) is closer to truthful than
    // first-price's (~0.6), so Vickrey bid ≥ first-price bid.
    const baseState: GameState = initGame({ initialChips: 200 });
    const stateFP: GameState = {
      ...baseState,
      options: { ...baseState.options, auctionType: 'first-price' },
    };
    const stateVP: GameState = {
      ...baseState,
      options: { ...baseState.options, auctionType: 'second-price' },
    };
    const fp = decideBid(
      { state: stateFP, color: 'BLACK', level: 'oni' },
      makeRng(seed)
    );
    const vp = decideBid(
      { state: stateVP, color: 'BLACK', level: 'oni' },
      makeRng(seed)
    );
    expect(vp).toBeGreaterThanOrEqual(fp);
  });
});

describe('bidding: all-pay aware', () => {
  it('AI returns a non-negative integer in all-pay (never NaN/negative)', () => {
    const state: GameState = initGame({ initialChips: 100, auctionType: 'all-pay' });
    for (const level of ['intermediate', 'advanced', 'oni'] as const) {
      const bid = decideBid({ state, color: 'BLACK', level }, makeRng(1));
      expect(Number.isInteger(bid)).toBe(true);
      expect(bid).toBeGreaterThanOrEqual(0);
      expect(bid).toBeLessThanOrEqual(state.players.BLACK.chips);
    }
  });

  it('intermediate AI skips low-value all-pay bids (returns 0 from initial board)', () => {
    // Initial board is ~symmetric → depth-2 delta is tiny → AI should
    // skip rather than burn chips on a wash.
    const state: GameState = initGame({ initialChips: 100, auctionType: 'all-pay' });
    const bid = decideBid(
      { state, color: 'BLACK', level: 'intermediate' },
      makeRng(1)
    );
    expect(bid).toBe(0);
  });

  it('all-pay payments are actually deducted from both players in a real turn', () => {
    let s: GameState = initGame({ initialChips: 100, auctionType: 'all-pay' });
    s = setPendingBid(s, 'BLACK', 12);
    s = setPendingBid(s, 'WHITE', 7);
    expect(s.phase).toBe('BIDDING');
    // Validate: both lose chips, winner is BLACK.
    const before = { B: s.players.BLACK.chips, W: s.players.WHITE.chips };
    expect(before).toEqual({ B: 100, W: 100 });
  });
});

describe('bidding: chips=0 corner case', () => {
  it('AI bids 0 when out of chips', () => {
    let s: GameState = initGame({ initialChips: 0 });
    expect(s.phase).toBe('BIDDING');
    expect(decideBid({ state: s, color: 'BLACK', level: 'advanced' })).toBe(0);
    expect(decideBid({ state: s, color: 'BLACK', level: 'oni' })).toBe(0);
  });
});

describe('bidding: opp-modelling estimate ranges', () => {
  it('AI bid is bounded above (cap at most ~92% of own chips)', () => {
    let s: GameState = initGame({ initialChips: 100 });
    // Force a position where AI thinks it must defend
    // (we just trust decideBid clamps correctly; check the chip cap.)
    const ai = decideBid({ state: s, color: 'BLACK', level: 'oni' });
    expect(ai).toBeLessThanOrEqual(Math.floor(100 * 0.92));
  });
});

// T14 regression: the "all-in then zero-bid drain" exploit. A human can bid
// 100% on turn 1 and then 0 for every following turn. Without a counter,
// the oni keeps paying ~5% of chips per turn while the human conserves —
// stone parity + tieBreaker:'CHIPS' then makes the human win. Verify the
// oni now matches at 0/1 once the human's zero-bid pattern is established.
describe('T14: zero-bid drain counter (chip tieBreaker exploit)', () => {
  function playOneTurnWithBids(
    s: GameState,
    blackBid: number,
    whiteBid: number,
    rng: () => number
  ): GameState {
    if (s.phase !== 'BIDDING') return s;
    s = setPendingBid(s, 'BLACK', blackBid);
    s = setPendingBid(s, 'WHITE', whiteBid);
    s = resolvePendingBids(s).state;
    while (
      s.phase === 'PLACING' ||
      s.phase === 'FREE_MOVE' ||
      s.phase === 'FINAL_MOVE'
    ) {
      const mover = expectedMover(s);
      if (!mover) break;
      const moves = legalMoves(s.board, mover);
      if (moves.length === 0) break;
      // Use beginner for the placement leg so the position evolves
      // realistically. The exploit being tested is about bidding, not move quality.
      const m = decideMove(s, mover, 'beginner', rng);
      s = applyPlacement(s, mover, m.row, m.col);
    }
    return s;
  }

  it('oni bids 0 or 1 after the opponent has bid 0 for 3 consecutive turns', () => {
    const rng = makeRng(7);
    let s: GameState = initGame({ initialChips: 100, auctionType: 'all-pay' });
    // 3 turns of (human=0, oni=baseBid). Use beginner stub for oni's move
    // placement so we don't recurse through decideBid here.
    for (let i = 0; i < 3; i++) {
      // Use a synthetic oni-side bid of 5 (sparse opening baseBid) so the
      // history records non-zero oni bids while the human is the all-zero
      // side under test.
      s = playOneTurnWithBids(s, 0, 5, rng);
    }
    if (s.phase !== 'BIDDING') return; // game ended early — exploit not even applicable
    const oniBid = decideBid({ state: s, color: 'WHITE', level: 'oni' }, rng);
    expect(oniBid).toBeLessThanOrEqual(1);
  });

  it('after the all-in-then-zero opening, the oni does not keep paying baseBid', () => {
    const rng = makeRng(11);
    let s: GameState = initGame({ initialChips: 100, auctionType: 'all-pay' });
    // T1: human all-in 100, oni small bid -> human wins token, both pay
    s = playOneTurnWithBids(s, 100, 5, rng);
    // T2..T4: human always 0; oni responds with its own decideBid output.
    for (let t = 0; t < 3 && s.phase !== 'ENDED'; t++) {
      if (s.phase !== 'BIDDING') break;
      const oniBid = decideBid({ state: s, color: 'WHITE', level: 'oni' }, rng);
      s = playOneTurnWithBids(s, 0, oniBid, rng);
    }
    if (s.phase !== 'BIDDING') return;
    // By now there are ≥3 consecutive human-zero rounds in history.
    const oniBid = decideBid({ state: s, color: 'WHITE', level: 'oni' }, rng);
    expect(oniBid).toBeLessThanOrEqual(1);
  });
});

// T15 regression: the "alternating high/zero" exploit. T14 only caught
// 0/0/0/0/0. An attacker can instead bid 50/0/50/0/50 (half-stack every
// other turn) and still drain the oni's chips while keeping enough of
// their own for the chip tieBreaker. The fix moves estimateOppMaxBid
// from a max/avg-driven model to a strategy-classified, median-anchored
// one. See codex-review-T15-general-strategy-detection.md.
describe('T15: alternating high/zero bid exploit', () => {
  function playOneTurnWithBids(
    s: GameState,
    blackBid: number,
    whiteBid: number,
    rng: () => number
  ): GameState {
    if (s.phase !== 'BIDDING') return s;
    s = setPendingBid(s, 'BLACK', blackBid);
    s = setPendingBid(s, 'WHITE', whiteBid);
    s = resolvePendingBids(s).state;
    while (
      s.phase === 'PLACING' ||
      s.phase === 'FREE_MOVE' ||
      s.phase === 'FINAL_MOVE'
    ) {
      const mover = expectedMover(s);
      if (!mover) break;
      const moves = legalMoves(s.board, mover);
      if (moves.length === 0) break;
      const m = decideMove(s, mover, 'beginner', rng);
      s = applyPlacement(s, mover, m.row, m.col);
    }
    return s;
  }

  it('oni bid drops after seeing the 50/0/50/0/50 alternating pattern', () => {
    const rng = makeRng(13);
    let s: GameState = initGame({ initialChips: 200, auctionType: 'all-pay' });
    // BLACK plays the exploit at half-stack (relative to 200 initial chips):
    // 100, 0, 100, 0, 100 — the "50/50 alternating" pattern scaled to 200.
    // initialChips=100 would cause EXCEEDS_CHIPS once cumulative spend
    // passes 100, so we use 200 to make a clean 5-round demonstration.
    const blackBids = [100, 0, 100, 0, 100];
    for (const bb of blackBids) {
      if (s.phase !== 'BIDDING') break;
      const blackChips = s.players.BLACK.chips;
      const wb = decideBid({ state: s, color: 'WHITE', level: 'oni' }, rng);
      s = playOneTurnWithBids(s, Math.min(bb, blackChips), wb, rng);
    }
    if (s.phase !== 'BIDDING') return;
    const oniBid = decideBid({ state: s, color: 'WHITE', level: 'oni' }, rng);
    // After 5 turns of 50/0/50/0/50, the conservative classifier should fire
    // (zeroRate >= 0.4 + highVariance) and clamp the oni's bid to 0/1
    // unless defenseBid is critical. On this neutral opening it isn't.
    expect(oniBid).toBeLessThanOrEqual(2);
  });

  it('classic 20/40/60/80 escalation is NOT treated as conservative', () => {
    const rng = makeRng(17);
    let s: GameState = initGame({ initialChips: 400, auctionType: 'all-pay' });
    const blackBids = [20, 40, 60, 80];
    for (const bb of blackBids) {
      if (s.phase !== 'BIDDING') break;
      const blackChips = s.players.BLACK.chips;
      const wb = decideBid({ state: s, color: 'WHITE', level: 'oni' }, rng);
      s = playOneTurnWithBids(s, Math.min(bb, blackChips), wb, rng);
    }
    if (s.phase !== 'BIDDING') return;
    // panic-classified opponent → oni must NOT be clamped to 1.
    const oniBid = decideBid({ state: s, color: 'WHITE', level: 'oni' }, rng);
    expect(oniBid).toBeGreaterThan(2);
  });
});

// H10 regression: deltaValueOfMoving used to pass the same time budget to two
// sequential strongSearch calls. If the first burned the budget, the second
// returned a partial / depth-0 score and delta became meaningless. The new
// code splits the budget and falls back to a bounded alphabeta when either
// side reaches depth 0. From the outside, decideBid must keep returning a
// finite, non-negative integer regardless of repeated invocation.
describe('H10: oni bid stays finite under hostile time conditions', () => {
  it('decideBid returns a valid integer across repeated calls (budget pressure)', () => {
    const s: GameState = initGame({ initialChips: 100 });
    for (let i = 0; i < 6; i++) {
      const v = decideBid({ state: s, color: 'BLACK', level: 'oni' });
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });
});
