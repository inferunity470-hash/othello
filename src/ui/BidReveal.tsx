import React, { useEffect, useMemo, useState } from 'react';
import { Color, GamePhase } from '../core/types';
import { FocusTrap } from './FocusTrap';
import { play as playSound } from './sound';

interface Props {
  bids: { BLACK: number; WHITE: number };
  winner: Color;
  payment: number;
  /**
   * Per-player chip payment. Both non-zero in `all-pay` auctions, where
   * the loser also forfeits their bid. If omitted, falls back to "winner
   * pays `payment`, loser pays 0".
   */
  payments?: { BLACK: number; WHITE: number };
  tieBroken: boolean;
  /**
   * Initiative holder *at the moment of bid resolution* (i.e. before any
   * placement). Pass `null` if the caller doesn't know.
   */
  holderAtResolve?: Color | null;
  /** Phase that resolution transitions into. */
  nextPhase?: GamePhase | null;
  onClose: () => void;
  /** Reading time after the verdict lands (total time is longer). */
  autoCloseMs?: number;
}

/**
 * Reveal runs as a staged sequence to build tension:
 *   sealed  — both bids face-down, cards vibrate, drumroll (~0.9s)
 *   open    — cards flip, numbers stamp in (+ extra beat on ties)
 *   verdict — winner bursts, payment / token info slides in
 * With prefers-reduced-motion the sequence collapses straight to `verdict`.
 *
 * On a tie, the rule is NOT a coin flip: the initiative-token holder always
 * wins (see `resolveBids` in core/bidding.ts). The extra beat below just
 * gives that reveal a beat of tension; it doesn't represent randomness.
 */
type RevealStage = 'sealed' | 'open' | 'verdict';

const FLIP_AT_MS = 900;
const VERDICT_DELAY_MS = 750; // after flip
const TIE_BEAT_MS = 650; // extra beat between flip and verdict on ties

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function useCountUp(target: number, durationMs = 600): number {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (durationMs <= 0) {
      setVal(target);
      return;
    }
    setVal(0);
    if (target === 0) {
      setVal(0);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = () => {
      const elapsed = performance.now() - start;
      const t = Math.min(1, elapsed / durationMs);
      const eased = 1 - Math.pow(1 - t, 2);
      setVal(Math.round(eased * target));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return val;
}

export function BidReveal({
  bids,
  winner,
  payment,
  payments,
  tieBroken,
  holderAtResolve = null,
  nextPhase = null,
  onClose,
  autoCloseMs = 2400,
}: Props) {
  const reduced = useMemo(prefersReducedMotion, []);
  const [stage, setStage] = useState<RevealStage>(reduced ? 'verdict' : 'sealed');

  // Resolve loser's payment for "all-pay" mode; defaults to 0 (winner-only).
  const loserColor: Color = winner === 'BLACK' ? 'WHITE' : 'BLACK';
  const loserPayment = payments ? payments[loserColor] : 0;
  const isAllPay = loserPayment > 0;

  useEffect(() => {
    if (reduced) {
      playSound('reveal');
      const t = setTimeout(onClose, autoCloseMs);
      return () => clearTimeout(t);
    }
    playSound('drumroll');
    const verdictAt =
      FLIP_AT_MS + (tieBroken ? TIE_BEAT_MS : 0) + VERDICT_DELAY_MS;
    const timers: ReturnType<typeof setTimeout>[] = [
      setTimeout(() => {
        setStage('open');
        playSound('stamp');
      }, FLIP_AT_MS),
      setTimeout(() => {
        setStage('verdict');
        playSound('bidWin');
      }, verdictAt),
      setTimeout(onClose, verdictAt + autoCloseMs),
    ];
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCloseMs, onClose, reduced, tieBroken]);

  // Determine the actual placer of the upcoming move.
  const placer: Color | null =
    nextPhase === 'FINAL_MOVE'
      ? holderAtResolve
      : nextPhase === 'PLACING'
        ? winner
        : nextPhase == null
          ? winner
          : null;
  const tokenWillTransfer =
    holderAtResolve != null && placer != null && placer === holderAtResolve;
  const tokenStays =
    holderAtResolve != null && placer != null && placer !== holderAtResolve;

  const opened = stage !== 'sealed';
  const verdict = stage === 'verdict';
  const countMs = reduced ? 0 : 500;
  const blackVal = useCountUp(opened ? bids.BLACK : 0, countMs);
  const whiteVal = useCountUp(opened ? bids.WHITE : 0, countMs);
  const paymentVal = useCountUp(verdict ? payment : 0, countMs);
  const loserPaymentVal = useCountUp(verdict ? loserPayment : 0, countMs);

  const sideClass = (color: Color) => {
    const cls = ['bid-flip', color === 'BLACK' ? 'black' : 'white'];
    if (opened) cls.push('flipped');
    if (verdict) cls.push(winner === color ? 'winner' : 'loser');
    return cls.join(' ');
  };

  return (
    <div
      className="overlay"
      onClick={onClose}
      role="alertdialog"
      aria-label="入札公開"
    >
      <FocusTrap onEscape={onClose} autoFocusSelector="button">
        <div
          className="overlay-card"
          onClick={e => e.stopPropagation()}
          style={{ maxWidth: 460 }}
        >
          <h2 style={{ textAlign: 'center' }}>入札公開</h2>
          <div className="bid-reveal">
            <div className={sideClass('BLACK')} aria-label={`黒の入札 ${bids.BLACK}`}>
              <div className="bid-card-inner">
                <div className="bid-card-face front">
                  <span>⚫ ?</span>
                </div>
                <div className="bid-card-face back">
                  <span>⚫ {blackVal}</span>
                </div>
              </div>
            </div>
            <div className={`versus ${tieBroken && opened && !verdict ? 'token-pulse' : ''}`}>
              {tieBroken && opened && !verdict ? (
                <span aria-hidden="true" style={{ color: 'var(--accent)' }}>
                  ★
                </span>
              ) : (
                'VS'
              )}
            </div>
            <div className={sideClass('WHITE')} aria-label={`白の入札 ${bids.WHITE}`}>
              <div className="bid-card-inner">
                <div className="bid-card-face front">
                  <span>? ⚪</span>
                </div>
                <div className="bid-card-face back">
                  <span>{whiteVal} ⚪</span>
                </div>
              </div>
            </div>
          </div>
          <div className="bid-verdict" style={{ textAlign: 'center', fontSize: '1.05rem' }}>
            {verdict ? (
              <div className="bid-verdict-in">
                {tieBroken ? (
                  <>
                    <strong aria-hidden="true" style={{ color: 'var(--accent)' }}>
                      ★
                    </strong>{' '}
                    同額 → 先手権保持者の{' '}
                  </>
                ) : (
                  '🏆 '
                )}
                <strong style={{ color: 'var(--accent)' }}>
                  {winner === 'BLACK' ? '黒' : '白'}
                </strong>{' '}
                が <strong>{paymentVal}</strong> を支払って着手
                {isAllPay && (
                  <div
                    className="muted"
                    style={{ marginTop: '0.3rem' }}
                    aria-label="敗者支払い (オールペイ)"
                  >
                    💸 {loserColor === 'BLACK' ? '黒' : '白'} も{' '}
                    <strong>{loserPaymentVal}</strong> を失います (オールペイ)
                  </div>
                )}
                {tokenWillTransfer && (
                  <div
                    className="muted"
                    style={{ marginTop: '0.3rem' }}
                    aria-label="トークン移動予告"
                  >
                    着手後、先手権トークンが {winner === 'BLACK' ? '白' : '黒'}{' '}
                    に移動します
                  </div>
                )}
                {tokenStays && (
                  <div className="muted" style={{ marginTop: '0.3rem' }}>
                    先手権トークンは{' '}
                    {holderAtResolve === 'BLACK' ? '黒' : '白'} のまま維持
                  </div>
                )}
              </div>
            ) : (
              <div className="muted">
                {opened && tieBroken
                  ? '同額! 先手権保持者が手番を取得...'
                  : '開示中...'}
              </div>
            )}
          </div>
          <button onClick={onClose}>閉じる (Esc)</button>
        </div>
      </FocusTrap>
    </div>
  );
}
