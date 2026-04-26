import React, { useEffect, useState } from 'react';
import { Color, GameState } from '../core/types';
import { currentMinBid, validateBid } from '../core/bidding';

interface Props {
  state: GameState;
  color: Color;
  onSubmit: (amount: number) => void;
  label?: string;
}

export function BidPanel({ state, color, onSubmit, label }: Props) {
  const chips = state.players[color].chips;
  const minBid = currentMinBid(state);
  const [amount, setAmount] = useState<number>(minBid);

  useEffect(() => {
    setAmount(minBid);
  }, [minBid, color, state.history.length]);

  const validation = validateBid(amount, chips, minBid);
  return (
    <div className="bid-panel">
      <div>
        <strong>{color === 'BLACK' ? '黒' : '白'}</strong> の入札
        {label && <span className="muted"> ・ {label}</span>}
      </div>
      <div className="bid-row">
        <input
          type="range"
          min={minBid}
          max={chips}
          value={amount}
          step={1}
          className="bid-slider"
          onChange={e => setAmount(parseInt(e.target.value, 10))}
          aria-label="入札額スライダー"
        />
        <input
          type="number"
          min={minBid}
          max={chips}
          step={1}
          value={amount}
          onChange={e => {
            const v = parseInt(e.target.value, 10);
            if (Number.isFinite(v)) setAmount(v);
          }}
          aria-label="入札額"
        />
      </div>
      <div className="bid-helper">
        手持ち {chips} ・ 入札 {amount} ・ 残 {chips - amount}
        {minBid > 0 && <> ・ <strong>最小 {minBid} 強制</strong></>}
      </div>
      {!validation.ok && (
        <div style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>
          無効な入札:{validation.reason}
        </div>
      )}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button onClick={() => setAmount(0)}>0 にする</button>
        <button onClick={() => setAmount(Math.floor(chips / 2))}>半分</button>
        <button onClick={() => setAmount(chips)}>全額</button>
        <button
          className="primary"
          disabled={!validation.ok}
          onClick={() => onSubmit(amount)}
        >
          確定
        </button>
      </div>
    </div>
  );
}
