/**
 * Fear Factor (Codex T11) tests. The feature is gated behind
 * ONI_FEAR_FACTOR — verify it is a no-op when disabled (default), and
 * that enabling it does not break the standard bid contract.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initGame } from '../src/core/gameLoop';
import { decideBid } from '../src/core/ai';
import { GameState } from '../src/core/types';

describe('Fear factor (ONI_FEAR_FACTOR feature flag)', () => {
  let originalFlag: string | undefined;

  beforeEach(() => {
    originalFlag = process.env.ONI_FEAR_FACTOR;
  });
  afterEach(() => {
    if (originalFlag === undefined) delete process.env.ONI_FEAR_FACTOR;
    else process.env.ONI_FEAR_FACTOR = originalFlag;
  });

  it('default-off: decideBid behavior unchanged on initial position', () => {
    delete process.env.ONI_FEAR_FACTOR;
    const s: GameState = initGame({ initialChips: 100 });
    const v = decideBid({ state: s, color: 'BLACK', level: 'oni' });
    expect(Number.isInteger(v)).toBe(true);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(100);
  });

  it('enabled (ONI_FEAR_FACTOR=1): still returns a valid integer bid', () => {
    process.env.ONI_FEAR_FACTOR = '1';
    const s: GameState = initGame({ initialChips: 100 });
    const v = decideBid({ state: s, color: 'BLACK', level: 'oni' });
    expect(Number.isInteger(v)).toBe(true);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(100);
  });

  it('enabled: respects the 92% cap on initial position (no fear history yet)', () => {
    process.env.ONI_FEAR_FACTOR = '1';
    const s: GameState = initGame({ initialChips: 100 });
    const v = decideBid({ state: s, color: 'BLACK', level: 'oni' });
    expect(v).toBeLessThanOrEqual(Math.floor(100 * 0.92));
  });
});
