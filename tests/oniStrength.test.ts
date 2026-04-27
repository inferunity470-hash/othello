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
import { hasLegalMove, countStones } from '../src/core/board';
import { GameState } from '../src/core/types';

function playGame(
  black: AILevel,
  white: AILevel,
  initialChips: number,
  seed: number
): GameState {
  const rng = makeRng(seed);
  let s = initGame({ initialChips });
  let safety = 1500;
  while (s.phase !== 'ENDED' && safety-- > 0) {
    if (s.phase === 'BIDDING') {
      const bidB = decideBid({ state: s, color: 'BLACK', level: black }, rng);
      const bidW = decideBid({ state: s, color: 'WHITE', level: white }, rng);
      s = setPendingBid(s, 'BLACK', bidB);
      s = setPendingBid(s, 'WHITE', bidW);
      const out = resolvePendingBids(s);
      s = out.state;
      if (s.phase === 'PLACING' || s.phase === 'FINAL_MOVE') {
        const mover = expectedMover(s)!;
        const lvl: AILevel = mover === 'BLACK' ? black : white;
        const m = decideMove(s, mover, lvl, rng);
        s = applyPlacement(s, mover, m.row, m.col);
      }
    } else if (s.phase === 'FREE_MOVE') {
      const mover = expectedMover(s)!;
      const lvl = mover === 'BLACK' ? black : white;
      const m = decideMove(s, mover, lvl, rng);
      s = applyPlacement(s, mover, m.row, m.col);
    } else if (s.phase === 'FINAL_MOVE') {
      if (!hasLegalMove(s.board, s.initiativeHolder)) {
        s = skipFinalMoveIfNoLegal(s);
      } else {
        const lvl = s.initiativeHolder === 'BLACK' ? black : white;
        const m = decideMove(s, s.initiativeHolder, lvl, rng);
        s = applyPlacement(s, s.initiativeHolder, m.row, m.col);
      }
    }
  }
  return s;
}

describe('oni strength (decisive)', () => {
  it('oni beats advanced ≥3 of 4 games (alternating colors)', () => {
    let oniWins = 0;
    let advWins = 0;
    let draws = 0;
    for (let i = 0; i < 4; i++) {
      const oniBlack = i % 2 === 0;
      const s = playGame(
        oniBlack ? 'oni' : 'advanced',
        oniBlack ? 'advanced' : 'oni',
        100,
        i + 7
      );
      const stones = countStones(s.board);
      const oni = oniBlack ? stones.BLACK : stones.WHITE;
      const adv = oniBlack ? stones.WHITE : stones.BLACK;
      if (oni > adv) oniWins++;
      else if (adv > oni) advWins++;
      else draws++;
    }
    expect(oniWins).toBeGreaterThanOrEqual(3);
  }, 240_000);

  it('oni beats intermediate 4/4', () => {
    let oniWins = 0;
    for (let i = 0; i < 4; i++) {
      const oniBlack = i % 2 === 0;
      const s = playGame(
        oniBlack ? 'oni' : 'intermediate',
        oniBlack ? 'intermediate' : 'oni',
        80,
        i * 11 + 3
      );
      const stones = countStones(s.board);
      const oni = oniBlack ? stones.BLACK : stones.WHITE;
      const other = oniBlack ? stones.WHITE : stones.BLACK;
      if (oni > other) oniWins++;
    }
    expect(oniWins).toBe(4);
  }, 240_000);

  it('oni does not crash with 0 chips (all FREE/FINAL flow)', () => {
    const s = playGame('oni', 'oni', 0, 1);
    expect(s.phase).toBe('ENDED');
  }, 60_000);
});
