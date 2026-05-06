import { describe, it, expect } from 'vitest';
import {
  applyPlacement,
  expectedMover,
  initGame,
  resolvePendingBids,
  setPendingBid,
  skipFinalMoveIfNoLegal,
  computeAutoPhase,
} from '../src/core/gameLoop';
import { hasLegalMove, legalMoves } from '../src/core/board';
import { replayEvents } from '../src/core/events';
import { Color, GameState } from '../src/core/types';

/**
 * Targeted regression suite for the new placement-driven initiative rule.
 *
 * Invariant under test:
 *   - mover === holder before placement  →  holder becomes opponent after
 *   - mover !== holder before placement  →  holder unchanged after
 */

function placeFirstLegal(state: GameState, mover: Color): GameState {
  const m = legalMoves(state.board, mover)[0];
  return applyPlacement(state, mover, m.row, m.col);
}

describe('initiative invariant: PLACING phase', () => {
  it('holder wins unequal bid, places → token transfers', () => {
    let s = initGame(); // holder = BLACK
    s = setPendingBid(s, 'BLACK', 20);
    s = setPendingBid(s, 'WHITE', 5);
    s = resolvePendingBids(s).state;
    expect(s.initiativeHolder).toBe('BLACK');
    s = placeFirstLegal(s, 'BLACK');
    expect(s.initiativeHolder).toBe('WHITE');
  });

  it('non-holder wins unequal bid, places → token stays', () => {
    let s = initGame(); // holder = BLACK
    s = setPendingBid(s, 'BLACK', 0);
    s = setPendingBid(s, 'WHITE', 10);
    s = resolvePendingBids(s).state;
    expect(s.initiativeHolder).toBe('BLACK');
    s = placeFirstLegal(s, 'WHITE');
    expect(s.initiativeHolder).toBe('BLACK');
  });

  it('tie: holder places, transfers; next tie alternates again', () => {
    let s = initGame({ initialChips: 100 }); // BLACK holder
    // Tie 1
    s = setPendingBid(s, 'BLACK', 5);
    s = setPendingBid(s, 'WHITE', 5);
    s = resolvePendingBids(s).state;
    s = placeFirstLegal(s, expectedMover(s)!);
    expect(s.initiativeHolder).toBe('WHITE');
    // Tie 2
    s = setPendingBid(s, 'BLACK', 5);
    s = setPendingBid(s, 'WHITE', 5);
    s = resolvePendingBids(s).state;
    s = placeFirstLegal(s, expectedMover(s)!);
    expect(s.initiativeHolder).toBe('BLACK');
  });
});

describe('initiative invariant: FREE_MOVE phase', () => {
  // For these tests we force phase=FREE_MOVE on the standard initial board.
  // The transfer rule is purely based on who places, so any legal placement
  // exercises the same code path as a "real" FREE_MOVE.
  it('non-holder placement keeps the token with the holder', () => {
    let s = initGame(); // holder = BLACK
    s = { ...s, phase: 'FREE_MOVE' };
    s = placeFirstLegal(s, 'WHITE');
    expect(s.initiativeHolder).toBe('BLACK');
  });

  it('holder placement transfers the token to the opponent', () => {
    let s = initGame({ initialChips: 50 });
    s = { ...s, initiativeHolder: 'WHITE', phase: 'FREE_MOVE' };
    s = placeFirstLegal(s, 'WHITE');
    expect(s.initiativeHolder).toBe('BLACK');
  });
});

describe('initiative invariant: chip-exhaustion phase', () => {
  it('both 0 chips with both having moves -> ENDED (no free final move)', () => {
    // Spec change: previously this routed to FINAL_MOVE so the holder
    // got one free placement. Now both are out of chips so the game
    // ends outright.
    let s = initGame({ initialChips: 0 });
    s = computeAutoPhase(s);
    expect(s.phase).toBe('ENDED');
    expect(s.endReason).toBe('CHIPS_EXHAUSTED');
  });

  it('FINAL_MOVE phase still terminates correctly when set manually', () => {
    // The phase enum still includes FINAL_MOVE for legacy reasons.
    // Verify that applying a placement under it transitions to ENDED.
    let s = initGame({ initialChips: 0 });
    s = { ...s, phase: 'FINAL_MOVE' };
    expect(s.initiativeHolder).toBe('BLACK');
    const m = legalMoves(s.board, 'BLACK')[0];
    s = applyPlacement(s, 'BLACK', m.row, m.col);
    expect(s.phase).toBe('ENDED');
    // Token should have transferred per the placement-driven rule.
    expect(s.initiativeHolder).toBe('WHITE');
  });
});

describe('replay correctness with new rule', () => {
  it('replays a tie+placement sequence faithfully', () => {
    let s = initGame({ initialChips: 100 });
    // Turn 1: tie
    s = setPendingBid(s, 'BLACK', 5);
    s = setPendingBid(s, 'WHITE', 5);
    s = resolvePendingBids(s).state;
    s = placeFirstLegal(s, expectedMover(s)!);
    // Turn 2: holder wins
    s = setPendingBid(s, 'BLACK', 0);
    s = setPendingBid(s, 'WHITE', 10);
    s = resolvePendingBids(s).state;
    s = placeFirstLegal(s, expectedMover(s)!);
    // Turn 3: non-holder wins
    s = setPendingBid(s, 'BLACK', 0);
    s = setPendingBid(s, 'WHITE', 5);
    s = resolvePendingBids(s).state;
    s = placeFirstLegal(s, expectedMover(s)!);

    const re = replayEvents(s.options, s.history);
    expect(re.board).toEqual(s.board);
    expect(re.players).toEqual(s.players);
    expect(re.initiativeHolder).toBe(s.initiativeHolder);
    // Spot-check the TurnRecord initiativeAfter values match
    for (let i = 0; i < s.history.length; i++) {
      expect(re.history[i].initiativeAfter).toBe(s.history[i].initiativeAfter);
    }
  });

  it('replays a chip-exhaustion path that ends the game', () => {
    // BLACK chips=0, WHITE chips=5. WHITE wins the next bid, pays 5 →
    // both at 0. New rule: game ends immediately (was FINAL_MOVE).
    let s = initGame({ initialChips: { BLACK: 0, WHITE: 5 } });
    expect(s.players.BLACK.chips).toBe(0);
    expect(s.players.WHITE.chips).toBe(5);
    s = setPendingBid(s, 'BLACK', 0);
    s = setPendingBid(s, 'WHITE', 5);
    s = resolvePendingBids(s).state;
    expect(s.phase).toBe('ENDED');
    expect(s.endReason).toBe('CHIPS_EXHAUSTED');
    expect(s.players.BLACK.chips).toBe(0);
    expect(s.players.WHITE.chips).toBe(0);
    expect(s.initiativeHolder).toBe('BLACK');

    // Replay should produce the same final state
    const re = replayEvents(s.options, s.history);
    expect(re.board).toEqual(s.board);
    expect(re.phase).toBe(s.phase);
    expect(re.initiativeHolder).toBe(s.initiativeHolder);
    expect(re.players).toEqual(s.players);
  });

  it('skipFinalMoveIfNoLegal: holder has no legal move → ENDED, holder unchanged', () => {
    let s = initGame({ initialChips: 0 });
    // Empty board → no stones at all, so neither side has any legal move.
    const b = Array.from({ length: 8 }, () =>
      Array.from({ length: 8 }, () => null as any)
    );
    s = { ...s, board: b, phase: 'FINAL_MOVE' };
    expect(hasLegalMove(s.board, s.initiativeHolder)).toBe(false);
    s = skipFinalMoveIfNoLegal(s);
    expect(s.phase).toBe('ENDED');
    expect(s.initiativeHolder).toBe('BLACK'); // no placement ⇒ holder unchanged
  });
});

describe('BidReveal token messaging accuracy (jsdom-free contract)', () => {
  // We don't render React here; just verify the *data the UI relies on* is
  // consistent with the placement-driven rule.
  it('PLACING + winner == holder → placer === holder (transfer)', () => {
    let s = initGame();
    s = setPendingBid(s, 'BLACK', 10);
    s = setPendingBid(s, 'WHITE', 5);
    const out = resolvePendingBids(s);
    expect(out.state.phase).toBe('PLACING');
    const placer = out.resolution.winner; // PLACING -> winner places
    expect(placer).toBe(out.state.initiativeHolder); // transfer expected
  });

  it('PLACING + winner != holder → placer !== holder (no transfer)', () => {
    let s = initGame();
    s = setPendingBid(s, 'BLACK', 0);
    s = setPendingBid(s, 'WHITE', 10);
    const out = resolvePendingBids(s);
    expect(out.state.phase).toBe('PLACING');
    const placer = out.resolution.winner;
    expect(placer).not.toBe(out.state.initiativeHolder);
  });

  it('chip exhaustion entry: bid resolved but game ends immediately', () => {
    // Setup BLACK chips=0, WHITE=5. WHITE wins by bidding 5, both reach 0.
    // New rule: game ends — neither player gets a free placement.
    let s = initGame({ initialChips: { BLACK: 0, WHITE: 5 } });
    s = setPendingBid(s, 'BLACK', 0);
    s = setPendingBid(s, 'WHITE', 5);
    const out = resolvePendingBids(s);
    expect(out.state.phase).toBe('ENDED');
    expect(out.state.endReason).toBe('CHIPS_EXHAUSTED');
    expect(out.resolution.winner).toBe('WHITE');
    // Initiative holder unchanged at game end (placement-driven token rule
    // only fires on actual placement, which doesn't happen here).
    expect(out.state.initiativeHolder).toBe('BLACK');
  });
});

describe('TurnRecord.initiativeAfter consistency', () => {
  it('PLACING records show post-placement holder', () => {
    let s = initGame();
    s = setPendingBid(s, 'BLACK', 10);
    s = setPendingBid(s, 'WHITE', 5);
    s = resolvePendingBids(s).state;
    s = placeFirstLegal(s, 'BLACK');
    const last = s.history[s.history.length - 1];
    expect(last.mover).toBe('BLACK');
    expect(last.initiativeAfter).toBe('WHITE'); // transferred
  });

  it('PLACING by non-holder leaves initiativeAfter unchanged', () => {
    let s = initGame();
    s = setPendingBid(s, 'BLACK', 0);
    s = setPendingBid(s, 'WHITE', 10);
    s = resolvePendingBids(s).state;
    s = placeFirstLegal(s, 'WHITE');
    const last = s.history[s.history.length - 1];
    expect(last.mover).toBe('WHITE');
    expect(last.initiativeAfter).toBe('BLACK'); // stayed
  });
});
