/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import React from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { App } from '../src/ui/App';
import { BoardView } from '../src/ui/Board';
import { BidPanel } from '../src/ui/BidPanel';
import { HUD } from '../src/ui/HUD';
import { BidReveal } from '../src/ui/BidReveal';
import { ResultCard } from '../src/ui/ResultCard';
import { HelpOverlay } from '../src/ui/HelpOverlay';
import { initGame } from '../src/core/gameLoop';

// Suppress not-helpful jsdom warnings about scroll on chat panel
beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation((...args) => {
    const msg = String(args[0] ?? '');
    // Suppress benign React act() warnings from setTimeouts in BidReveal
    if (msg.includes('not wrapped in act')) return;
    if (msg.includes('Could not parse CSS')) return;
    return undefined;
  });
});

describe('UI smoke (jsdom)', () => {
  it('App renders the lobby without crashing', () => {
    const { unmount, getByText } = render(<App />);
    expect(getByText(/ビッド式オセロ/)).toBeTruthy();
    expect(getByText(/同機ホットシート/)).toBeTruthy();
    expect(getByText(/NPC 対戦/)).toBeTruthy();
    expect(getByText(/友達とオンライン/)).toBeTruthy();
    unmount();
  });

  it('BoardView renders 64 cells', () => {
    const s = initGame();
    const { container, unmount } = render(<BoardView state={s} />);
    const cells = container.querySelectorAll('.cell');
    expect(cells.length).toBe(64);
    // Initial 4 stones present
    const discs = container.querySelectorAll('.disc');
    expect(discs.length).toBe(4);
    unmount();
  });

  it('BoardView highlights legal moves for BLACK at start (4 hints)', () => {
    const s = initGame();
    const { container, unmount } = render(
      <BoardView state={s} showLegalForColor="BLACK" />
    );
    const hints = container.querySelectorAll('.legal-hint');
    expect(hints.length).toBe(4);
    unmount();
  });

  it('BidPanel calls onSubmit with the chosen amount', () => {
    const s = initGame();
    const onSubmit = vi.fn();
    const { getByText, unmount } = render(
      <BidPanel state={s} color="BLACK" onSubmit={onSubmit} />
    );
    fireEvent.click(getByText(/入札を確定/));
    expect(onSubmit).toHaveBeenCalled();
    unmount();
  });

  it('HUD shows phase banner and both players', () => {
    const s = initGame();
    const { getByText, getAllByText, unmount } = render(
      <HUD state={s} myColor="BLACK" />
    );
    expect(getByText(/入札フェーズ/)).toBeTruthy();
    // both players have 200 chips initially -> two matches
    expect(getAllByText('200').length).toBeGreaterThanOrEqual(2);
    unmount();
  });

  it('BidReveal shows both bids and triggers onClose', () => {
    const onClose = vi.fn();
    const { getByLabelText, getByText, unmount } = render(
      <BidReveal
        bids={{ BLACK: 30, WHITE: 20 }}
        winner="BLACK"
        payment={30}
        tieBroken={false}
        onClose={onClose}
        autoCloseMs={50_000}
      />
    );
    expect(getByLabelText(/黒の入札 30/)).toBeTruthy();
    expect(getByLabelText(/白の入札 20/)).toBeTruthy();
    fireEvent.click(getByText('閉じる'));
    expect(onClose).toHaveBeenCalled();
    unmount();
  });

  it('ResultCard shows winner correctly', () => {
    const s = {
      ...initGame(),
      phase: 'ENDED' as const,
      endReason: 'BOTH_NO_MOVES' as const,
    };
    // Manually set a board with BLACK majority
    s.board = Array.from({ length: 8 }, () => Array(8).fill('BLACK'));
    s.board[0][0] = 'WHITE';
    const { getByText, unmount } = render(<ResultCard state={s} />);
    // 63 black, 1 white -> BLACK wins
    expect(getByText(/勝利/)).toBeTruthy();
    expect(getByText(/63/)).toBeTruthy();
    unmount();
  });

  it('HelpOverlay renders rule sections and closes', () => {
    const onClose = vi.fn();
    const { getByText, unmount } = render(<HelpOverlay onClose={onClose} />);
    expect(getByText(/ビッド式オセロ ルール/)).toBeTruthy();
    expect(getByText(/角ボーナス/)).toBeTruthy();
    fireEvent.click(getByText('閉じる'));
    expect(onClose).toHaveBeenCalled();
    unmount();
  });

  it('App can switch tabs in lobby without errors', () => {
    const { getAllByText, getByText, unmount } = render(<App />);
    // Click the NPC tab (button) — there might be multiple text matches in muted help, so pick the first.
    fireEvent.click(getAllByText(/NPC 対戦/)[0]);
    expect(getByText(/難易度/)).toBeTruthy();
    fireEvent.click(getAllByText(/友達とオンライン/)[0]);
    fireEvent.click(getAllByText(/同機ホットシート/)[0]);
    unmount();
  });

  it('Help overlay can be opened from header', () => {
    const { getByText, unmount } = render(<App />);
    fireEvent.click(getByText(/ルール/));
    expect(getByText(/基本/)).toBeTruthy();
    unmount();
  });

  it('Hotseat mode: clicking 対局開始 starts a game with bidding', () => {
    const { getByText, queryByText, unmount } = render(<App />);
    fireEvent.click(getByText(/対局開始/));
    // A handoff overlay should appear
    expect(queryByText(/黒 の番です/)).toBeTruthy();
    unmount();
  });

  it('AI tab: shows level options including 鬼', () => {
    const { getByText, getByDisplayValue, unmount } = render(<App />);
    fireEvent.click(getByText(/NPC 対戦/));
    // Level select default = intermediate
    expect(getByDisplayValue(/中級/)).toBeTruthy();
    // Confirm 'oni' option exists
    expect(getByText(/鬼 ― 終盤完全解析/)).toBeTruthy();
    unmount();
  });
});
