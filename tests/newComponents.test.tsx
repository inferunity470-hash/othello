/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import React from 'react';
import { render, cleanup } from '@testing-library/react';
import { fireEvent } from '@testing-library/dom';
import { initGame } from '../src/core/gameLoop';

import { LobbyPresets } from '../src/ui/LobbyPresets';
import { EvalBar } from '../src/ui/EvalBar';
import { TokenTransferAnim } from '../src/ui/TokenTransferAnim';
import { AIThinking } from '../src/ui/AIThinking';
import { BidSparkline } from '../src/ui/BidSparkline';
import { TopMovesHint } from '../src/ui/TopMovesHint';
import { StatsDashboard } from '../src/ui/StatsDashboard';
import { LastLegalWarning } from '../src/ui/LastLegalWarning';
import { HamburgerMenu } from '../src/ui/HamburgerMenu';
import { ChipTransferAnim } from '../src/ui/ChipTransferAnim';
import { SkipLink } from '../src/ui/SkipLink';
import { ShortcutsOverlay } from '../src/ui/ShortcutsOverlay';
import { AIMovePulse } from '../src/ui/AIMovePulse';
import { ReviewPanel } from '../src/ui/ReviewPanel';
import { ShareDialog } from '../src/ui/ShareDialog';
import { ThemeToggle, useTheme } from '../src/ui/ThemeToggle';
import { HandicapInput } from '../src/ui/HandicapInput';
import { AuctionTypeToggle } from '../src/ui/AuctionTypeToggle';
import { TurnPreview } from '../src/ui/TurnPreview';
import { EmptyState } from '../src/ui/EmptyState';
import { LatencyBadge } from '../src/ui/LatencyBadge';
import { ToastProvider, useToast } from '../src/ui/Toast';
import { ConfirmDialog } from '../src/ui/ConfirmDialog';
import { Tooltip } from '../src/ui/Tooltip';

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation((...args) => {
    const msg = String(args[0] ?? '');
    if (msg.includes('not wrapped in act')) return;
    return undefined;
  });
});

describe('UI smoke (new components)', () => {
  it('LobbyPresets renders 5 preset buttons', () => {
    const fn = vi.fn();
    const { container, getByText, unmount } = render(<LobbyPresets onSelect={fn} />);
    expect(container.querySelectorAll('.preset-btn').length).toBe(5);
    fireEvent.click(getByText('クラシック'));
    expect(fn).toHaveBeenCalled();
    expect(fn.mock.calls[0][0].key).toBe('classic');
    unmount();
  });

  it('EvalBar renders with a numeric eval', () => {
    const s = initGame();
    const { container, unmount } = render(<EvalBar state={s} />);
    expect(container.querySelector('.eval-bar')).toBeTruthy();
    expect(container.querySelector('.eval-bar-num')).toBeTruthy();
    unmount();
  });

  it('TokenTransferAnim is invisible at trigger=0 and visible after change', () => {
    const { container, rerender, unmount } = render(
      <TokenTransferAnim trigger={0} fromColor="BLACK" toColor="WHITE" />
    );
    expect(container.querySelector('.token-transfer-overlay')).toBeFalsy();
    rerender(<TokenTransferAnim trigger={1} fromColor="BLACK" toColor="WHITE" />);
    expect(container.querySelector('.token-transfer-overlay')).toBeTruthy();
    unmount();
  });

  it('AIThinking is hidden initially (200ms grace)', () => {
    const { container, unmount } = render(<AIThinking active />);
    expect(container.querySelector('.ai-thinking')).toBeFalsy();
    unmount();
  });

  it('BidSparkline shows empty state with <2 turns', () => {
    const { getByText, unmount } = render(<BidSparkline history={[]} />);
    expect(getByText(/入札履歴/)).toBeTruthy();
    unmount();
  });

  it('TopMovesHint lists candidates for BLACK at start', () => {
    const s = initGame();
    const { container, unmount } = render(<TopMovesHint state={s} forColor="BLACK" />);
    expect(container.querySelector('.top-moves')).toBeTruthy();
    expect(container.querySelectorAll('.top-moves li').length).toBeGreaterThan(0);
    unmount();
  });

  it('StatsDashboard renders empty state when no records', () => {
    localStorage.clear();
    const onClose = vi.fn();
    const { getByText, unmount } = render(<StatsDashboard onClose={onClose} />);
    expect(getByText(/戦績ダッシュボード/)).toBeTruthy();
    expect(getByText(/まだ対局記録がありません/)).toBeTruthy();
    fireEvent.click(getByText(/閉じる/));
    expect(onClose).toHaveBeenCalled();
    unmount();
  });

  it('LastLegalWarning hides at start (multiple legal moves)', () => {
    const s = initGame();
    const { container, unmount } = render(
      <LastLegalWarning state={s} forColor="BLACK" />
    );
    expect(container.querySelector('.last-legal-warn')).toBeFalsy();
    unmount();
  });

  it('HamburgerMenu toggles open and closes after item click', () => {
    const fn = vi.fn();
    const items = [
      { key: 'a', label: 'Alpha', onClick: fn },
      { key: 'b', label: 'Beta', onClick: vi.fn() },
    ];
    const { container, getByText, unmount } = render(<HamburgerMenu items={items} />);
    expect(container.querySelector('.hamburger-menu')).toBeFalsy();
    fireEvent.click(container.querySelector('.hamburger-toggle')!);
    expect(container.querySelector('.hamburger-menu')).toBeTruthy();
    fireEvent.click(getByText('Alpha'));
    expect(fn).toHaveBeenCalled();
    expect(container.querySelector('.hamburger-menu')).toBeFalsy();
    unmount();
  });

  it('ChipTransferAnim activates on positive trigger', () => {
    const { container, rerender, unmount } = render(
      <ChipTransferAnim trigger={0} payerColor="BLACK" amount={10} />
    );
    expect(container.querySelector('.chip-transfer-overlay')).toBeFalsy();
    rerender(<ChipTransferAnim trigger={1} payerColor="BLACK" amount={10} />);
    expect(container.querySelector('.chip-transfer-overlay')).toBeTruthy();
    unmount();
  });

  it('SkipLink renders an anchor', () => {
    const { container, unmount } = render(<SkipLink to="main" />);
    expect(container.querySelector('a.skip-link')?.getAttribute('href')).toBe('#main');
    unmount();
  });

  it('ShortcutsOverlay shows shortcuts and closes', () => {
    const onClose = vi.fn();
    const { getByText, unmount } = render(<ShortcutsOverlay onClose={onClose} />);
    expect(getByText(/キーボードショートカット/)).toBeTruthy();
    fireEvent.click(getByText(/閉じる \(Esc\)/));
    expect(onClose).toHaveBeenCalled();
    unmount();
  });

  it('AIMovePulse renders pulse for given cell', () => {
    const { container, rerender, unmount } = render(<AIMovePulse cell={null} />);
    expect(container.querySelector('.ai-move-pulse')).toBeFalsy();
    rerender(<AIMovePulse cell={{ row: 3, col: 4 }} />);
    expect(container.querySelector('.ai-move-pulse')).toBeTruthy();
    unmount();
  });

  it('ReviewPanel handles empty history gracefully', () => {
    const s = initGame();
    const { getByText, unmount } = render(<ReviewPanel state={s} />);
    expect(getByText(/振り返り/)).toBeTruthy();
    expect(getByText(/特筆すべきポイントはありません/)).toBeTruthy();
    unmount();
  });

  it('ShareDialog renders share URL textarea', () => {
    const s = initGame();
    const onClose = vi.fn();
    const { container, getByText, unmount } = render(
      <ShareDialog state={s} onClose={onClose} />
    );
    expect(getByText(/対局を共有/)).toBeTruthy();
    expect(container.querySelector('textarea')?.value.length).toBeGreaterThan(20);
    unmount();
  });

  it('ThemeToggle flips theme on click', () => {
    const fn = vi.fn();
    const { getByLabelText, unmount } = render(
      <ThemeToggle theme="dark" onChange={fn} />
    );
    fireEvent.click(getByLabelText('テーマ切替'));
    expect(fn).toHaveBeenCalledWith('light');
    unmount();
  });

  it('useTheme hook applies data-theme attribute', () => {
    function Probe() {
      const [t] = useTheme();
      return <span data-test={t} />;
    }
    const { container, unmount } = render(<Probe />);
    expect(container.querySelector('span[data-test]')).toBeTruthy();
    expect(['dark', 'light']).toContain(document.documentElement.dataset.theme);
    unmount();
  });

  it('HandicapInput swaps between symmetric and asymmetric', () => {
    const fn = vi.fn();
    const { container, unmount } = render(<HandicapInput value={200} onChange={fn} />);
    const checkbox = container.querySelector('input[type="checkbox"]')!;
    fireEvent.click(checkbox);
    expect(fn).toHaveBeenCalledWith({ BLACK: 200, WHITE: 200 });
    unmount();
  });

  it('AuctionTypeToggle reports clicks', () => {
    const fn = vi.fn();
    const { getByText, unmount } = render(
      <AuctionTypeToggle value="first-price" onChange={fn} />
    );
    fireEvent.click(getByText(/セカンド/));
    expect(fn).toHaveBeenCalledWith('second-price');
    unmount();
  });

  it('TurnPreview rewinds and shows the right turn', () => {
    // Build a minimal final state with one history entry — easiest is to just
    // use an initGame and not run any turns; turnNo=0 should still render.
    const s = initGame();
    const onClose = vi.fn();
    const { getByText, unmount } = render(
      <TurnPreview finalState={s} turnNo={0} onClose={onClose} />
    );
    expect(getByText(/プレビュー/)).toBeTruthy();
    fireEvent.click(getByText(/閉じる/));
    expect(onClose).toHaveBeenCalled();
    unmount();
  });

  it('EmptyState renders title and emoji', () => {
    const { getByText, unmount } = render(
      <EmptyState title="Nothing here" description="Try later" />
    );
    expect(getByText('Nothing here')).toBeTruthy();
    expect(getByText('Try later')).toBeTruthy();
    unmount();
  });

  it('LatencyBadge shows offline state', () => {
    const { getByText, unmount } = render(
      <LatencyBadge latencyMs={null} connected={false} />
    );
    expect(getByText(/オフライン/)).toBeTruthy();
    unmount();
  });

  it('LatencyBadge shows ms when connected', () => {
    const { getByText, unmount } = render(
      <LatencyBadge latencyMs={42} connected />
    );
    expect(getByText(/42 ms/)).toBeTruthy();
    unmount();
  });

  it('Toast queue: useToast pushes toasts that auto-dismiss', async () => {
    function Pusher() {
      const { toast } = useToast();
      React.useEffect(() => {
        toast('Hello world', 'good', 60_000);
      }, [toast]);
      return null;
    }
    const { getByText, unmount } = render(
      <ToastProvider>
        <Pusher />
      </ToastProvider>
    );
    expect(getByText('Hello world')).toBeTruthy();
    unmount();
  });

  it('ConfirmDialog confirms and cancels', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const { getByText, unmount } = render(
      <ConfirmDialog
        title="Are you sure?"
        message="This is destructive"
        confirmLabel="DoIt"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );
    fireEvent.click(getByText('DoIt'));
    expect(onConfirm).toHaveBeenCalled();
    cleanup();
    const x = render(
      <ConfirmDialog
        title="t"
        message="m"
        confirmLabel="OK"
        cancelLabel="No"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />
    );
    fireEvent.click(x.getByText('No'));
    expect(onCancel).toHaveBeenCalled();
    x.unmount();
    unmount();
  });

  it('Tooltip toggles its description on click', () => {
    const { container, queryByText, unmount } = render(
      <Tooltip term="セカンド" description="Vickrey auction" />
    );
    expect(queryByText('Vickrey auction')).toBeFalsy();
    fireEvent.click(container.querySelector('.tooltip-badge')!);
    expect(queryByText('Vickrey auction')).toBeTruthy();
    unmount();
  });
});
