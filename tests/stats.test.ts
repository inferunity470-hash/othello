/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { aggregate, GameRecord } from '../src/ui/stats';

function rec(
  winner: 'BLACK' | 'WHITE' | 'DRAW',
  myColor: GameRecord['myColor'] = 'BLACK'
): GameRecord {
  return {
    endedAt: Date.now(),
    durationMs: 1000,
    options: { initialChips: 200, cornerBonus: 10 },
    result: {
      winner,
      stones: { BLACK: 32, WHITE: 32 },
      finalChips: { BLACK: 100, WHITE: 100 },
      endReason: 'BOTH_NO_MOVES',
    },
    turns: 60,
    myColor,
    avgBid: { BLACK: 10, WHITE: 12 },
    cornersTaken: { BLACK: 1, WHITE: 1 },
    reverseAuctions: { BLACK: 0, WHITE: 0 },
    tieBids: 0,
  };
}

describe('aggregate stats', () => {
  beforeEach(() => {
    try {
      localStorage.clear();
    } catch {
      /* ignore */
    }
  });

  it('handles empty records', () => {
    const s = aggregate([]);
    expect(s.total).toBe(0);
    expect(s.longestStreak).toEqual({ kind: 'none', n: 0 });
  });

  it('counts a win streak walking back from most recent', () => {
    // Order is oldest → newest. So newest is the last entry.
    const records = [
      rec('WHITE'), // oldest: loss for BLACK
      rec('BLACK'),
      rec('BLACK'),
      rec('BLACK'), // newest: win
    ];
    const s = aggregate(records);
    expect(s.myWins).toBe(3);
    expect(s.myLosses).toBe(1);
    expect(s.longestStreak).toEqual({ kind: 'win', n: 3 });
  });

  it('a recent draw breaks the streak (regression)', () => {
    // Without the fix, an early DRAW silently reset curKind to null and
    // overcounted on the next iteration.
    const records = [
      rec('BLACK'),
      rec('BLACK'),
      rec('DRAW'), // newest: draw → streak should be 0/none
    ];
    const s = aggregate(records);
    expect(s.draws).toBe(1);
    expect(s.longestStreak).toEqual({ kind: 'none', n: 0 });
  });

  it('a loss streak is detected when most recent is a loss', () => {
    const records = [
      rec('BLACK'),
      rec('WHITE'),
      rec('WHITE'),
    ];
    const s = aggregate(records);
    expect(s.longestStreak).toEqual({ kind: 'loss', n: 2 });
  });

  it('SPECTATE entries do not contribute to streak', () => {
    const records = [
      rec('BLACK', 'SPECTATE'),
      rec('BLACK'),
      rec('BLACK'),
    ];
    const s = aggregate(records);
    expect(s.longestStreak).toEqual({ kind: 'win', n: 2 });
  });
});

describe('recordGame wiring (regression guard)', () => {
  // App.tsx must call recordGame() on ENDED. Without this, StatsDashboard
  // is permanently empty and the App Store description is misleading.
  // See qa/bug-reports/2026-05-17-stats-not-recorded.md.
  it('App.tsx invokes recordGame on the ENDED phase', () => {
    const appSource = readFileSync(
      path.resolve(__dirname, '..', 'src', 'ui', 'App.tsx'),
      'utf8'
    );
    expect(appSource).toMatch(/import\s*\{\s*recordGame\s*\}\s*from\s*['"]\.\/stats['"]/);
    expect(appSource).toMatch(/recordGame\s*\(\s*state\s*,/);
  });
});
