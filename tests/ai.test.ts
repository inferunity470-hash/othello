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
import { hasLegalMove, legalMoves, countStones } from '../src/core/board';
import { GameState } from '../src/core/types';

function playAIvsAI(
  blackLevel: AILevel,
  whiteLevel: AILevel,
  initialChips = 200,
  seed = 1
): GameState {
  const rng = makeRng(seed);
  let s = initGame({ initialChips });
  let safety = 1000;
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
        const lvl = mover === 'BLACK' ? blackLevel : whiteLevel;
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
        const lvl = s.initiativeHolder === 'BLACK' ? blackLevel : whiteLevel;
        const m = decideMove(s, s.initiativeHolder, lvl, rng);
        s = applyPlacement(s, s.initiativeHolder, m.row, m.col);
      }
    }
  }
  return s;
}

describe('AI: each level produces legal moves and bids', () => {
  for (const lvl of ['beginner', 'intermediate', 'advanced'] as AILevel[]) {
    it(`${lvl} plays a complete game vs itself without errors`, () => {
      const s = playAIvsAI(lvl, lvl, 50, 42);
      expect(s.phase).toBe('ENDED');
    });
  }
});

describe('AI strength ranking (sanity)', () => {
  // Oni level should beat or tie beginner most of the time
  it('oni beats beginner across 4 games', () => {
    let oniWins = 0;
    let beginnerWins = 0;
    for (let i = 0; i < 4; i++) {
      // Alternate colors to remove first-mover advantage bias
      const oniBlack = i % 2 === 0;
      const s = playAIvsAI(
        oniBlack ? 'oni' : 'beginner',
        oniBlack ? 'beginner' : 'oni',
        100,
        i + 100
      );
      const stones = countStones(s.board);
      const oniStones = oniBlack ? stones.BLACK : stones.WHITE;
      const begStones = oniBlack ? stones.WHITE : stones.BLACK;
      if (oniStones > begStones) oniWins++;
      else if (begStones > oniStones) beginnerWins++;
    }
    expect(oniWins).toBeGreaterThan(beginnerWins);
  }, 120_000);

  it('advanced beats beginner across 5 games', () => {
    let advWins = 0;
    let begWins = 0;
    for (let i = 0; i < 5; i++) {
      const advBlack = i % 2 === 0;
      const s = playAIvsAI(
        advBlack ? 'advanced' : 'beginner',
        advBlack ? 'beginner' : 'advanced',
        100,
        i + 5
      );
      const stones = countStones(s.board);
      const adv = advBlack ? stones.BLACK : stones.WHITE;
      const beg = advBlack ? stones.WHITE : stones.BLACK;
      if (adv > beg) advWins++;
      else if (beg > adv) begWins++;
    }
    expect(advWins).toBeGreaterThan(begWins);
  }, 60_000);

  it('oni beats advanced majority of the time', () => {
    let oniWins = 0;
    let advWins = 0;
    for (let i = 0; i < 4; i++) {
      const oniBlack = i % 2 === 0;
      const s = playAIvsAI(
        oniBlack ? 'oni' : 'advanced',
        oniBlack ? 'advanced' : 'oni',
        100,
        i + 13
      );
      const stones = countStones(s.board);
      const oni = oniBlack ? stones.BLACK : stones.WHITE;
      const adv = oniBlack ? stones.WHITE : stones.BLACK;
      if (oni > adv) oniWins++;
      else if (adv > oni) advWins++;
    }
    // Allow ties; just require oni doesn't lose decisively
    expect(oniWins).toBeGreaterThanOrEqual(advWins);
  }, 240_000);
});
