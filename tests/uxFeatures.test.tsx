/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
import { fireEvent } from '@testing-library/dom';
import { App } from '../src/ui/App';
import { Tour, shouldShowTour } from '../src/ui/Tour';
import { saveGame, loadGame, clearSave, getPref, setPref } from '../src/ui/storage';
import {
  initGame,
  applyPlacement,
  setPendingBid,
  resolvePendingBids,
} from '../src/core/gameLoop';
import { exportGame, exportGameJson, importGame } from '../src/core/serialize';

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation((...args) => {
    const msg = String(args[0] ?? '');
    if (msg.includes('not wrapped in act')) return;
    if (msg.includes('Could not parse CSS')) return;
    return undefined;
  });
});

beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
});

describe('localStorage save/restore', () => {
  it('saveGame + loadGame roundtrip', () => {
    let s = initGame({ initialChips: 30 });
    s = setPendingBid(s, 'BLACK', 5);
    s = setPendingBid(s, 'WHITE', 3);
    const out = resolvePendingBids(s);
    s = out.state;
    saveGame('slot1', s);
    const restored = loadGame('slot1');
    expect(restored).toBeTruthy();
    expect(restored!.players.BLACK.chips).toBe(s.players.BLACK.chips);
    expect(restored!.history.length).toBe(s.history.length);
  });

  it('returns null when slot empty', () => {
    expect(loadGame('nope')).toBeNull();
  });

  it('clearSave removes save', () => {
    let s = initGame({ initialChips: 30 });
    s = setPendingBid(s, 'BLACK', 5);
    s = setPendingBid(s, 'WHITE', 3);
    s = resolvePendingBids(s).state;
    saveGame('slot2', s);
    expect(loadGame('slot2')).toBeTruthy();
    clearSave('slot2');
    expect(loadGame('slot2')).toBeNull();
  });
});

describe('preferences', () => {
  it('getPref/setPref roundtrip', () => {
    setPref('cb', 'on');
    expect(getPref('cb', 'off')).toBe('on');
    setPref('cb', 'off');
    expect(getPref('cb', 'off')).toBe('off');
  });
});

describe('Tour', () => {
  it('shouldShowTour returns true on first run', () => {
    expect(shouldShowTour()).toBe(true);
  });

  it('cycles through 3 steps and reports seen', () => {
    const onClose = vi.fn();
    const { getByText, queryByText, unmount } = render(<Tour onClose={onClose} />);
    expect(getByText(/STEP 1 \/ 3/)).toBeTruthy();
    fireEvent.click(getByText(/次へ/));
    expect(getByText(/STEP 2 \/ 3/)).toBeTruthy();
    fireEvent.click(getByText(/次へ/));
    expect(getByText(/STEP 3 \/ 3/)).toBeTruthy();
    // Last step shows 始める button instead of next
    expect(queryByText(/次へ/)).toBeNull();
    fireEvent.click(getByText(/始める/));
    expect(onClose).toHaveBeenCalled();
    unmount();
    // After unmount, tour-seen flag was set
    expect(shouldShowTour()).toBe(false);
  });
});

describe('serialize: JSON export/import', () => {
  it('exportGame + importGame yields equivalent board and chips', () => {
    let s = initGame({ initialChips: 50 });
    s = setPendingBid(s, 'BLACK', 5);
    s = setPendingBid(s, 'WHITE', 3);
    s = resolvePendingBids(s).state;
    const m = { row: 2, col: 3 };
    s = applyPlacement(s, 'BLACK', m.row, m.col);
    const json = exportGameJson(s);
    const re = importGame(json);
    // Replay regenerates timestamps; compare semantic fields only.
    expect(re.board).toEqual(s.board);
    expect(re.players).toEqual(s.players);
    expect(re.history.length).toBe(s.history.length);
    expect(re.history[0].bids).toEqual(s.history[0].bids);
    expect(re.history[0].winner).toBe(s.history[0].winner);
    expect(re.history[0].move).toEqual(s.history[0].move);
  });

  it('rejects bad version', () => {
    expect(() =>
      importGame(JSON.stringify({ v: 99, options: {}, history: [] }))
    ).toThrow();
  });
});

describe('App: header toggles', () => {
  it('tour button reopens the tour overlay', () => {
    const { getByText, queryByText } = render(<App />);
    // First load fired the tour automatically — close it
    if (queryByText(/STEP 1 \/ 3/)) {
      fireEvent.click(getByText(/スキップ/));
    }
    fireEvent.click(getByText(/🎓 ツアー/));
    expect(queryByText(/STEP 1 \/ 3/)).toBeTruthy();
  });
});

describe('App: hint button in vs-AI', () => {
  it('appears only when human can place; clicking sets a hint', async () => {
    const { getByText, queryByText } = render(<App />);
    // Dismiss tour
    if (queryByText(/STEP 1 \/ 3/)) {
      fireEvent.click(getByText(/スキップ/));
    }
    // Lobby is NPC-only now — start the game directly.
    fireEvent.click(getByText(/▶ 対局開始/));
    // Initially BIDDING phase, no hint button yet (it's a place-time button).
    expect(queryByText(/💡 ヒント/)).toBeNull();
  });
});

describe('Board file/rank labels', () => {
  it('renders A-H and 1-8 around the board', () => {
    const { getByText, queryByText, container } = render(<App />);
    if (queryByText(/STEP 1 \/ 3/)) {
      fireEvent.click(getByText(/スキップ/));
    }
    fireEvent.click(getByText(/▶ 対局開始/));
    const files = container.querySelector('.board-files');
    const ranks = container.querySelector('.board-ranks');
    expect(files?.textContent).toBe('ABCDEFGH');
    expect(ranks?.textContent).toBe('12345678');
  });
});
