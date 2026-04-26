import React, { useEffect } from 'react';
import { Color } from '../core/types';

interface Props {
  bids: { BLACK: number; WHITE: number };
  winner: Color;
  payment: number;
  tieBroken: boolean;
  onClose: () => void;
  autoCloseMs?: number;
}

export function BidReveal({
  bids,
  winner,
  payment,
  tieBroken,
  onClose,
  autoCloseMs = 2400,
}: Props) {
  useEffect(() => {
    const t = setTimeout(onClose, autoCloseMs);
    return () => clearTimeout(t);
  }, [autoCloseMs, onClose]);

  return (
    <div className="overlay" onClick={onClose} role="alertdialog" aria-label="入札公開">
      <div className="overlay-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
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
          {tieBroken && (
            <div className="muted" style={{ marginTop: '0.3rem' }}>
              先手権トークンが {winner === 'BLACK' ? '白' : '黒'} に移動
            </div>
          )}
        </div>
        <button onClick={onClose}>閉じる</button>
      </div>
    </div>
  );
}
