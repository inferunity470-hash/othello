import React, { useEffect, useState } from 'react';
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
  autoCloseMs?: number;
}

function useCountUp(target: number, durationMs = 600): number {
  const [val, setVal] = useState(0);
  useEffect(() => {
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
  // Resolve loser's payment for "all-pay" mode; defaults to 0 (winner-only).
  const loserColor: Color = winner === 'BLACK' ? 'WHITE' : 'BLACK';
  const loserPayment = payments ? payments[loserColor] : 0;
  const isAllPay = loserPayment > 0;
  useEffect(() => {
    playSound('reveal');
    const t = setTimeout(onClose, autoCloseMs);
    return () => clearTimeout(t);
  }, [autoCloseMs, onClose]);

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

  const paymentVal = useCountUp(payment, 600);
  const loserPaymentVal = useCountUp(loserPayment, 600);
  const blackVal = useCountUp(bids.BLACK, 700);
  const whiteVal = useCountUp(bids.WHITE, 700);

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
            <div
              className={`bid-reveal-side black ${winner === 'BLACK' ? 'winner' : ''}`}
              aria-label={`黒の入札 ${bids.BLACK}`}
            >
              ⚫ {blackVal}
            </div>
            <div className="versus">VS</div>
            <div
              className={`bid-reveal-side white ${winner === 'WHITE' ? 'winner' : ''}`}
              aria-label={`白の入札 ${bids.WHITE}`}
            >
              {whiteVal} ⚪
            </div>
          </div>
          <div style={{ textAlign: 'center', fontSize: '1.05rem' }}>
            {tieBroken ? '🪙 同額 → ' : '🏆 '}
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
          <button onClick={onClose}>閉じる (Esc)</button>
        </div>
      </FocusTrap>
    </div>
  );
}
