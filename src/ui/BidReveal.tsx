import React, { useEffect } from 'react';
import { Color, GamePhase } from '../core/types';
import { FocusTrap } from './FocusTrap';
import { play as playSound } from './sound';

interface Props {
  bids: { BLACK: number; WHITE: number };
  winner: Color;
  payment: number;
  tieBroken: boolean;
  /**
   * Initiative holder *at the moment of bid resolution* (i.e. before any
   * placement). Pass `null` if the caller doesn't know.
   */
  holderAtResolve?: Color | null;
  /**
   * Phase that resolution transitions into. We need this because:
   *   - PLACING: bid winner places; transfer if winner === holderAtResolve.
   *   - FINAL_MOVE: holder places (not winner); transfer happens (always).
   *   - ENDED: nobody places; no transfer message.
   */
  nextPhase?: GamePhase | null;
  onClose: () => void;
  autoCloseMs?: number;
}

export function BidReveal({
  bids,
  winner,
  payment,
  tieBroken,
  holderAtResolve = null,
  nextPhase = null,
  onClose,
  autoCloseMs = 2400,
}: Props) {
  useEffect(() => {
    playSound('reveal');
    const t = setTimeout(onClose, autoCloseMs);
    return () => clearTimeout(t);
  }, [autoCloseMs, onClose]);

  // Determine the actual placer of the upcoming move:
  //   - PLACING: the bid winner places.
  //   - FINAL_MOVE: the initiative holder places (not necessarily the winner).
  //   - ENDED / others: no placement — skip transfer messaging.
  const placer: Color | null =
    nextPhase === 'FINAL_MOVE'
      ? holderAtResolve
      : nextPhase === 'PLACING'
      ? winner
      : nextPhase == null
      ? winner // legacy callers without nextPhase: assume PLACING
      : null;
  const tokenWillTransfer =
    holderAtResolve != null && placer != null && placer === holderAtResolve;
  const tokenStays =
    holderAtResolve != null && placer != null && placer !== holderAtResolve;

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
              ⚫ {bids.BLACK}
            </div>
            <div className="versus">VS</div>
            <div
              className={`bid-reveal-side white ${winner === 'WHITE' ? 'winner' : ''}`}
              aria-label={`白の入札 ${bids.WHITE}`}
            >
              {bids.WHITE} ⚪
            </div>
          </div>
          <div style={{ textAlign: 'center', fontSize: '1.05rem' }}>
            {tieBroken ? '🪙 同額 → ' : '🏆 '}
            <strong style={{ color: 'var(--accent)' }}>
              {winner === 'BLACK' ? '黒' : '白'}
            </strong>{' '}
            が {payment} を支払って着手
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
