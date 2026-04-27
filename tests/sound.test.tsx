/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { play, setEnabled, isEnabled, setVolume, getVolume } from '../src/ui/sound';

beforeEach(() => {
  // Restore default state between tests.
  setEnabled(true);
  setVolume(0.35);
});

describe('sound module', () => {
  it('does not throw in environments without AudioContext', () => {
    // jsdom does NOT provide AudioContext by default. play() should be a
    // graceful no-op and not throw.
    expect(typeof (window as any).AudioContext).toBe('undefined');
    expect(() => play('place')).not.toThrow();
    expect(() => play('flip')).not.toThrow();
    expect(() => play('bid')).not.toThrow();
    expect(() => play('reveal')).not.toThrow();
    expect(() => play('cornerBonus')).not.toThrow();
    expect(() => play('gameWin')).not.toThrow();
    expect(() => play('gameLose')).not.toThrow();
    expect(() => play('gameDraw')).not.toThrow();
  });

  it('setEnabled/isEnabled toggle correctly', () => {
    setEnabled(false);
    expect(isEnabled()).toBe(false);
    setEnabled(true);
    expect(isEnabled()).toBe(true);
  });

  it('disabled => play is a no-op (no errors)', () => {
    setEnabled(false);
    expect(() => play('gameWin')).not.toThrow();
  });

  it('setVolume clamps to [0..1]', () => {
    setVolume(-1);
    expect(getVolume()).toBe(0);
    setVolume(2);
    expect(getVolume()).toBe(1);
    setVolume(0.5);
    expect(getVolume()).toBe(0.5);
  });

  it('uses AudioContext when one becomes available', async () => {
    // Sound module lazy-initialises its AudioContext on first play(). If we
    // stub the constructor BEFORE the first play in this test environment,
    // it should be invoked.
    const created: any[] = [];
    const fakeCtx: any = {
      currentTime: 0,
      state: 'running',
      destination: {},
      createGain: vi.fn(() => ({
        gain: {
          value: 0,
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
      })),
      createOscillator: vi.fn(() => {
        const o = {
          type: 'sine',
          frequency: { value: 0, setValueAtTime: vi.fn() },
          connect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
        };
        created.push(o);
        return o;
      }),
      resume: vi.fn(() => Promise.resolve()),
    };
    const ctorSpy = vi.fn(() => fakeCtx);
    (window as any).AudioContext = ctorSpy;
    // Re-import a fresh module instance so it picks up the stub before any
    // earlier ctx caching takes effect.
    vi.resetModules();
    const mod = await import('../src/ui/sound');
    mod.setEnabled(true);
    mod.setVolume(0.5);
    mod.play('place');
    expect(ctorSpy).toHaveBeenCalled();
    expect(fakeCtx.createOscillator).toHaveBeenCalled();
    expect(created.length).toBeGreaterThan(0);
    delete (window as any).AudioContext;
  });
});
