import React from 'react';
import { GameOptions } from '../core/types';

interface Props {
  value: GameOptions['initialChips'];
  onChange: (next: GameOptions['initialChips']) => void;
}

/**
 * Toggle between symmetric and per-color chip counts. When asymmetric is
 * enabled, both BLACK and WHITE inputs are shown; otherwise a single
 * input controls both. Spec §17.1 (handicap option).
 */
export function HandicapInput({ value, onChange }: Props) {
  const isAsymmetric = typeof value !== 'number';
  const black = typeof value === 'number' ? value : value.BLACK;
  const white = typeof value === 'number' ? value : value.WHITE;

  return (
    <div className="handicap" role="group" aria-label="ハンディキャップ設定">
      <label className="row" style={{ gap: '0.4rem' }}>
        <input
          type="checkbox"
          checked={isAsymmetric}
          onChange={e => {
            if (e.target.checked) {
              onChange({ BLACK: black, WHITE: white });
            } else {
              onChange(black);
            }
          }}
        />
        <span>ハンディキャップ (色ごとに異なるチップ)</span>
      </label>
      {isAsymmetric ? (
        <div className="row">
          <label className="stack">
            <span>⚫ 黒の初期チップ</span>
            <input
              type="number"
              min={1}
              max={1000}
              value={black}
              onChange={e =>
                onChange({
                  BLACK: parseInt(e.target.value, 10) || 0,
                  WHITE: white,
                })
              }
            />
          </label>
          <label className="stack">
            <span>⚪ 白の初期チップ</span>
            <input
              type="number"
              min={1}
              max={1000}
              value={white}
              onChange={e =>
                onChange({
                  BLACK: black,
                  WHITE: parseInt(e.target.value, 10) || 0,
                })
              }
            />
          </label>
        </div>
      ) : (
        <label className="stack">
          <span>初期チップ (両者共通)</span>
          <input
            type="number"
            min={1}
            max={1000}
            value={black}
            onChange={e => onChange(parseInt(e.target.value, 10) || 0)}
          />
        </label>
      )}
    </div>
  );
}
