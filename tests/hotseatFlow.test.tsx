/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, act } from '@testing-library/react';
import { fireEvent } from '@testing-library/dom';
import { App } from '../src/ui/App';

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

/**
 * End-to-end test of a hotseat game:
 *  1. From lobby, start hotseat
 *  2. Dismiss handoff overlays
 *  3. Submit a bid for BLACK then WHITE
 *  4. Verify reveal modal appears
 *  5. Close reveal, verify state advanced
 */
describe('hotseat flow (jsdom)', () => {
  it('plays through one bidding round', async () => {
    const { getByText, queryByText } = render(<App />);
    // Start hotseat
    await act(async () => {
      fireEvent.click(getByText(/▶ 対局開始/));
    });
    // First handoff: black ready
    expect(getByText(/🔒 黒 の番です/)).toBeTruthy();
    await act(async () => {
      fireEvent.click(getByText('確認'));
    });
    // Submit BLACK's bid (default = minBid = 0). Look up the button now.
    expect(queryByText(/✓ 入札を確定/)).toBeTruthy();
    await act(async () => {
      fireEvent.click(getByText(/✓ 入札を確定/));
    });
    // Now handoff for WHITE
    expect(queryByText(/🔒 白 の番です/)).toBeTruthy();
    await act(async () => {
      fireEvent.click(getByText('確認'));
    });
    // Submit WHITE's bid
    await act(async () => {
      fireEvent.click(getByText(/✓ 入札を確定/));
    });
    // Bid reveal should appear
    expect(queryByText(/入札公開/)).toBeTruthy();
    // Close reveal
    await act(async () => {
      fireEvent.click(getByText(/閉じる/));
    });
    // Then a pre-place handoff should appear
    expect(queryByText(/着手フェーズ/)).toBeTruthy();
  });

  it('Help overlay opens and closes', () => {
    const { getByText, queryByText, getAllByText } = render(<App />);
    fireEvent.click(getByText(/ルール/));
    expect(getByText(/ビッド式オセロ ルール/)).toBeTruthy();
    expect(getByText(/戦略のコア/)).toBeTruthy();
    // Click the dialog's primary 閉じる button
    const closes = getAllByText(/閉じる/);
    fireEvent.click(closes[closes.length - 1]);
    expect(queryByText(/ビッド式オセロ ルール/)).toBeNull();
  });
});
