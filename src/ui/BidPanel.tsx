import React, { useEffect, useMemo, useState } from 'react';
import { Color, GameState } from '../core/types';
import { currentMinBid, validateBid } from '../core/bidding';
import { play as playSound } from './sound';

interface Props {
  state: GameState;
  color: Color;
  onSubmit: (amount: number) => void;
  label?: string;
  hideOpponent?: boolean;
}

export function BidPanel({ state, color, onSubmit, label }: Props) {
  const chips = state.players[color].chips;
  const minBid = currentMinBid(state);
  const [amount, setAmount] = useState<number>(minBid);

  useEffect(() => {
    setAmount(minBid);
  }, [minBid, color, state.history.length]);

  const validation = validateBid(amount, chips, minBid);
  const presets = useMemo(() => buildPresets(chips, minBid), [chips, minBid]);

  return (
    <div className="bid-panel">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h3>
          {color === 'BLACK' ? '⚫' : '⚪'}{' '}
          <span style={{ color: 'var(--accent)' }}>
            {color === 'BLACK' ? '黒' : '白'}
          </span>{' '}
          の入札
        </h3>
        {label && <span className="muted">{label}</span>}
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
          style={{ textAlign: 'center', fontWeight: 700, fontSize: '1.05rem' }}
        />
      </div>
      <div className="bid-helper">
        <span>
          手持ち <strong>{chips}</strong>
        </span>
        <span>→ 賭ける <strong>{Math.max(0, amount)}</strong></span>
        <span>
          残 <strong>{Math.max(0, chips - amount)}</strong>
        </span>
        {minBid > 0 && (
          <span className="pill warn">最小 {minBid}</span>
        )}
      </div>

      <div className="quick-bid-grid">
        {presets.map(p => (
          <button key={p.label} onClick={() => setAmount(p.value)}>
            {p.label}
          </button>
        ))}
      </div>

      {!validation.ok && (
        <div style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>
          ⚠️ {validationMessage(validation.reason)}
        </div>
      )}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button
          className="primary"
          disabled={!validation.ok}
          onClick={() => {
            playSound('bid');
            onSubmit(amount);
          }}
        >
          ✓ 入札を確定
        </button>
      </div>
    </div>
  );
}

function buildPresets(chips: number, minBid: number) {
  const out: Array<{ label: string; value: number }> = [];
  if (minBid <= 0) out.push({ label: '0', value: 0 });
  if (chips >= 1 && minBid <= 1) out.push({ label: '1', value: 1 });
  const tiers = [
    { label: '1/4', frac: 0.25 },
    { label: '半分', frac: 0.5 },
    { label: '3/4', frac: 0.75 },
    { label: '全額', frac: 1.0 },
  ];
  for (const t of tiers) {
    const v = Math.max(minBid, Math.floor(chips * t.frac));
    if (v <= chips && !out.some(o => o.value === v)) {
      out.push({ label: t.label, value: v });
    }
  }
  return out.slice(0, 5);
}

function validationMessage(reason?: string): string {
  switch (reason) {
    case 'NOT_INTEGER':
      return '整数を入力してください';
    case 'BELOW_MIN':
      return '最小入札を満たしていません';
    case 'EXCEEDS_CHIPS':
      return '手持ちチップを超えています';
    default:
      return '入力値が無効です';
  }
}
