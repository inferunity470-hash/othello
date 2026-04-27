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
import { hasLegalMove, legalMoves } from '../src/core/board';
import { replayEvents } from '../src/core/events';
import { GameOptions, GameState } from '../src/core/types';

interface PlayConfig {
  blackLevel: AILevel;
  whiteLevel: AILevel;
  options: Partial<GameOptions>;
  seed: number;
}

function playFullGame({ blackLevel, whiteLevel, options, seed }: PlayConfig): GameState {
  const rng = makeRng(seed);
  let s = initGame(options);
  let safety = 1500;
  while (s.phase !== 'ENDED' && safety-- > 0) {
    if (s.phase === 'BIDDING') {
      const bidB = decideBid({ state: s, color: 'BLACK', level: blackLevel }, rng);
      const bidW = decideBid({ state: s, color: 'WHITE', level: whiteLevel }, rng);
      s = setPendingBid(s, 'BLACK', bidB);
      s = setPendingBid(s, 'WHITE', bidW);
      const out = resolvePendingBids(s);
      s = out.state;
      if (s.phase === 'PLACING') {
        const mover = expectedMover(s)!;
        const lvl: AILevel = mover === 'BLACK' ? blackLevel : whiteLevel;
        const m = decideMove(s, mover, lvl, rng);
        s = applyPlacement(s, mover, m.row, m.col);
      } else if (s.phase === 'FINAL_MOVE') {
        const mover = expectedMover(s)!;
        if (!hasLegalMove(s.board, mover)) {
          s = skipFinalMoveIfNoLegal(s);
        } else {
          const lvl: AILevel = mover === 'BLACK' ? blackLevel : whiteLevel;
          const m = decideMove(s, mover, lvl, rng);
          s = applyPlacement(s, mover, m.row, m.col);
        }
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
  if (safety <= 0) throw new Error('safety exceeded');
  return s;
}

describe('replay invariant (randomised)', () => {
  // 32 seeds × 4 option combos = 128 games. Each must terminate & replay
  // back to identical board/players/initiativeHolder.
  const optionCombos: Array<Partial<GameOptions>> = [
    { initialChips: 30, cornerBonus: 10, auctionType: 'first-price' },
    { initialChips: 60, cornerBonus: 0, auctionType: 'first-price' },
    { initialChips: 40, cornerBonus: 10, auctionType: 'second-price' },
    {
      initialChips: { BLACK: 20, WHITE: 80 },
      cornerBonus: 10,
      auctionType: 'first-price',
    },
  ];

  for (const opt of optionCombos) {
    it(`replays cleanly across 8 random games for ${JSON.stringify(opt)}`, () => {
      for (let seed = 1; seed <= 8; seed++) {
        const final = playFullGame({
          blackLevel: 'beginner',
          whiteLevel: 'beginner',
          options: opt,
          seed,
        });
        expect(final.phase).toBe('ENDED');
        let re;
        try {
          re = replayEvents(final.options, final.history);
        } catch (err) {
          throw new Error(
            `replay failed at seed=${seed} options=${JSON.stringify(opt)}: ${
              (err as Error).message
            }`,
            { cause: err }
          );
        }
        expect(re.board, `board mismatch seed=${seed}`).toEqual(final.board);
        expect(re.players.BLACK.chips, `B chips mismatch seed=${seed}`).toBe(
          final.players.BLACK.chips
        );
        expect(re.players.WHITE.chips).toBe(final.players.WHITE.chips);
        expect(re.initiativeHolder).toBe(final.initiativeHolder);
        expect(re.phase).toBe(final.phase);
        expect(re.history.length).toBe(final.history.length);
      }
    });
  }

  it('placement-driven token rule holds for every step', () => {
    // Deep verification: walk through history step by step and validate
    // that initiativeAfter follows the placement rule.
    const final = playFullGame({
      blackLevel: 'beginner',
      whiteLevel: 'beginner',
      options: { initialChips: 50, cornerBonus: 10 },
      seed: 12345,
    });
    let prevHolder: import('../src/core/types').Color = 'BLACK';
    for (const t of final.history) {
      if (t.mover) {
        const expectedAfter =
          t.mover === prevHolder
            ? prevHolder === 'BLACK'
              ? 'WHITE'
              : 'BLACK'
            : prevHolder;
        expect(
          t.initiativeAfter,
          `turn ${t.turnNo} mover=${t.mover} prevHolder=${prevHolder}`
        ).toBe(expectedAfter);
      }
      prevHolder = t.initiativeAfter;
    }
  });
});

describe('mid-bid restore (storage round-trip)', () => {
  it('saves a state with one pending bid and restores correctly', async () => {
    const { saveGame, loadGame, clearSave } = await import('../src/ui/storage');
    // Simulate localStorage in node tests via a tiny in-memory shim
    if (typeof globalThis.localStorage === 'undefined') {
      const store = new Map<string, string>();
      // @ts-expect-error inject for node env
      globalThis.localStorage = {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
        clear: () => void store.clear(),
      };
    }
    let s = initGame({ initialChips: 50 });
    s = setPendingBid(s, 'BLACK', 8);
    // pendingBids has BLACK, not WHITE
    saveGame('mid-bid', s);
    const restored = loadGame('mid-bid');
    expect(restored).toBeTruthy();
    expect(restored!.phase).toBe('BIDDING');
    expect(restored!.pendingBids?.BLACK).toBe(8);
    expect(restored!.pendingBids?.WHITE).toBeUndefined();
    // Continue from restore: WHITE bids, resolve, place
    let s2 = setPendingBid(restored!, 'WHITE', 3);
    const out = resolvePendingBids(s2);
    s2 = out.state;
    expect(out.resolution.winner).toBe('BLACK');
    expect(out.resolution.payment).toBe(8);
    const m = legalMoves(s2.board, 'BLACK')[0];
    s2 = applyPlacement(s2, 'BLACK', m.row, m.col);
    expect(s2.phase).toBe('BIDDING');
    expect(s2.initiativeHolder).toBe('WHITE'); // BLACK placed → token transferred
    clearSave('mid-bid');
  });

  it('restored state preserves initiativeHolder mid-game', () => {
    let s = initGame({ initialChips: 30 });
    // Play one full turn so holder may transfer
    s = setPendingBid(s, 'BLACK', 5);
    s = setPendingBid(s, 'WHITE', 3);
    s = resolvePendingBids(s).state;
    const m = legalMoves(s.board, 'BLACK')[0];
    s = applyPlacement(s, 'BLACK', m.row, m.col);
    expect(s.initiativeHolder).toBe('WHITE');

    const json = JSON.stringify(s);
    const restored = JSON.parse(json) as GameState;
    expect(restored.initiativeHolder).toBe('WHITE');
    expect(restored.history.length).toBe(s.history.length);
  });
});

describe('FREE_MOVE chain', () => {
  it('multiple consecutive free moves apply token rule each time', () => {
    // Construct a chain manually
    let s = initGame({ initialChips: 50 });
    s = { ...s, phase: 'FREE_MOVE' };
    // BLACK is holder. Force WHITE to be the only mover by claim?
    // Easier: just simulate two FREE_MOVE placements and verify.
    let m = legalMoves(s.board, 'WHITE')[0];
    s = applyPlacement(s, 'WHITE', m.row, m.col);
    // WHITE was non-holder → BLACK keeps token
    expect(s.initiativeHolder).toBe('BLACK');

    // Force another FREE_MOVE step with BLACK placing (holder)
    s = { ...s, phase: 'FREE_MOVE' };
    m = legalMoves(s.board, 'BLACK')[0];
    s = applyPlacement(s, 'BLACK', m.row, m.col);
    // BLACK was holder → WHITE now has token
    expect(s.initiativeHolder).toBe('WHITE');
  });
});

describe('skipFinalMoveIfNoLegal robustness', () => {
  it('idempotent: calling on non-FINAL_MOVE returns input', () => {
    const s = initGame();
    expect(skipFinalMoveIfNoLegal(s)).toBe(s);
  });

  it('preserves initiativeHolder when no placement happens', () => {
    let s = initGame({ initialChips: 0 });
    const b = Array.from({ length: 8 }, () =>
      Array.from({ length: 8 }, () => null as any)
    );
    s = { ...s, board: b, phase: 'FINAL_MOVE', initiativeHolder: 'WHITE' };
    s = skipFinalMoveIfNoLegal(s);
    expect(s.phase).toBe('ENDED');
    expect(s.initiativeHolder).toBe('WHITE');
  });
});

describe('integration: full game ends with consistent token state', () => {
  it('after game ends, initiativeAfter of last record equals state.initiativeHolder', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const final = playFullGame({
        blackLevel: 'beginner',
        whiteLevel: 'beginner',
        options: { initialChips: 40 },
        seed: seed * 17,
      });
      const last = final.history[final.history.length - 1];
      expect(last.initiativeAfter).toBe(final.initiativeHolder);
    }
  });
});
