import React from 'react';
import { GameOptions } from '../core/types';
import { Tooltip } from './Tooltip';

interface Props {
  value: GameOptions['auctionType'];
  onChange: (next: GameOptions['auctionType']) => void;
}

/**
 * Toggle between first-price (winner pays own bid) and second-price /
 * Vickrey (winner pays loser's bid). Includes an inline term tooltip.
 */
export function AuctionTypeToggle({ value, onChange }: Props) {
  return (
    <div className="auction-toggle row" role="radiogroup" aria-label="競売方式">
      <Tooltip
        term={<span>競売方式</span>}
        description={
          <span>
            <strong>ファースト</strong> = 落札者が自分の入札額を支払う。
            <br />
            <strong>セカンド</strong> = 落札者は相手の入札額を支払う (Vickrey)。
            <br />
            セカンドは「正直に評価額を入札する」のが弱支配戦略。
          </span>
        }
      />
      <div className="segmented">
        <button
          role="radio"
          aria-checked={value === 'first-price'}
          className={value === 'first-price' ? 'active' : ''}
          onClick={() => onChange('first-price')}
          title="落札者が自分の入札額を支払う"
        >
          🪙 ファースト
        </button>
        <button
          role="radio"
          aria-checked={value === 'second-price'}
          className={value === 'second-price' ? 'active' : ''}
          onClick={() => onChange('second-price')}
          title="Vickrey: 落札者は相手の入札額を支払う"
        >
          🎲 セカンド
        </button>
      </div>
    </div>
  );
}
