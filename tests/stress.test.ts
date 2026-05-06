import { describe, it, expect } from 'vitest';
import { AILevel, decideBid, decideMove, makeRng } from '../src/core/ai';
import {
  applyPlacement,
  expectedMover,
  initGame,
  resolvePendingBids,
  setPendingBid,
  skipFinalMoveIfNoLegal,
} from '../src/core/gameLoop';
import { hasLegalMove } from '../src/core/board';
import { GameState, Color } from '../src/core/types';
import { replayEvents } from '../src/core/events';

function playGame(
  blackLevel: AILevel,
  whiteLevel: AILevel,
  initialChips: number,
  seed: number,
  options: Partial<{
    cornerBonus: number;
    zeroBidStreakLimit: number | null;
    auctionType: 'first-price' | 'second-price' | 'all-pay';
  }> = {}
): GameState {
  const rng = makeRng(seed);
  let s = initGame({
    initialChips,
    cornerBonus: options.cornerBonus ?? 10,
    zeroBidStreakLimit: options.zeroBidStreakLimit ?? null,
    auctionType: options.auctionType ?? 'all-pay',
  });
  let safety = 1500;
  while (s.phase !== 'ENDED' && safety-- > 0) {
    if (s.phase === 'BIDDING') {
      const bidB = decideBid({ state: s, color: 'BLACK', level: blackLevel }, rng);
      const bidW = decideBid({ state: s, color: 'WHITE', level: whiteLevel }, rng);
      s = setPendingBid(s, 'BLACK', bidB);
      s = setPendingBid(s, 'WHITE', bidW);
      const out = resolvePendingBids(s);
      s = out.state;
      if (s.phase === 'PLACING' || s.phase === 'FINAL_MOVE') {
        const mover = expectedMover(s)!;
        const lvl: AILevel = mover === 'BLACK' ? blackLevel : whiteLevel;
        const m = decideMove(s, mover, lvl, rng);
        s = applyPlacement(s, mover, m.row, m.col);
      }
    } else if (s.phase === 'FREE_MOVE') {
      const mover = expectedMover(s)!;
      const lvl = mover === 'BLACK' ? blackLevel : whiteLevel;
      const m = decideMove(s, mover, lvl, rng);
      s = applyPlacement(s, mover, m.row, m.col);
    } else if (s.phase === 'FINAL_MOVE') {
      if (!hasLegalMove(s.board, s.initiativeHolder)) {
        s = skipFinalMoveIfNoLegal(s);
      } else {
        const lvl: AILevel = s.initiativeHolder === 'BLACK' ? blackLevel : whiteLevel;
        const m = decideMove(s, s.initiativeHolder, lvl, rng);
        s = applyPlacement(s, s.initiativeHolder, m.row, m.col);
      }
    }
  }
  if (safety <= 0) throw new Error('safety exceeded');
  return s;
}

describe('stress: many random games', () => {
  it('20 random vs random games all terminate cleanly', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = playGame('beginner', 'beginner', 30 + (seed % 30), seed);
      expect(s.phase).toBe('ENDED');
    }
  });

  it('replayEvents reproduces final board for 10 simulated games', () => {
    for (let seed = 100; seed <= 109; seed++) {
      const s = playGame('beginner', 'beginner', 25 + (seed % 20), seed);
      const replayed = replayEvents(s.options, s.history);
      expect(replayed.board).toEqual(s.board);
      expect(replayed.players.BLACK.chips).toBe(s.players.BLACK.chips);
      expect(replayed.players.WHITE.chips).toBe(s.players.WHITE.chips);
      expect(replayed.phase).toBe(s.phase);
    }
  });

  it('with zeroBidStreakLimit = 2, games still terminate', () => {
    for (let seed = 200; seed <= 205; seed++) {
      const s = playGame('beginner', 'beginner', 50, seed, { zeroBidStreakLimit: 2 });
      expect(s.phase).toBe('ENDED');
    }
  });

  it('with cornerBonus = 0, games terminate', () => {
    for (let seed = 300; seed <= 305; seed++) {
      const s = playGame('beginner', 'beginner', 50, seed, { cornerBonus: 0 });
      expect(s.phase).toBe('ENDED');
    }
  });

  it('intermediate vs random across 5 games — intermediate competitive', () => {
    let intWins = 0;
    let begWins = 0;
    for (let i = 0; i < 5; i++) {
      const intBlack = i % 2 === 0;
      const s = playGame(
        intBlack ? 'intermediate' : 'beginner',
        intBlack ? 'beginner' : 'intermediate',
        100,
        i + 500,
        // Use first-price for stable AI strength comparison; all-pay
        // strategy is more stochastic and not what this test measures.
        { auctionType: 'first-price' }
      );
      const intStones = intBlack
        ? countStones(s.board, 'BLACK')
        : countStones(s.board, 'WHITE');
      const begStones = intBlack
        ? countStones(s.board, 'WHITE')
        : countStones(s.board, 'BLACK');
      if (intStones > begStones) intWins++;
      else if (begStones > intStones) begWins++;
    }
    expect(intWins).toBeGreaterThanOrEqual(begWins);
  });
});

function countStones(board: GameState['board'], color: Color): number {
  let n = 0;
  for (const row of board) for (const c of row) if (c === color) n++;
  return n;
}
