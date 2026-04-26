import React from 'react';
import { GameState, TurnRecord } from '../core/types';

interface Props {
  state: GameState;
  onJumpTo?: (turnNo: number) => void;
}

function moveStr(t: TurnRecord): string {
  if (!t.move) return '—';
  if (t.move === 'PASS') return 'パス';
  const file = String.fromCharCode('A'.charCodeAt(0) + t.move.col);
  const rank = t.move.row + 1;
  return `${file}${rank}`;
}

export function GameLog({ state, onJumpTo }: Props) {
  return (
    <div className="log" aria-label="対局ログ">
      {state.history.length === 0 && (
        <div className="muted">まだ着手はありません。</div>
      )}
      {state.history.map(t => {
        const tag =
          t.phaseAtStart === 'BIDDING'
            ? `${t.bids?.BLACK}-${t.bids?.WHITE}${t.tieBroken ? '*' : ''}`
            : t.phaseAtStart === 'FREE_MOVE'
            ? '無償'
            : '最終';
        const winner = t.winner ?? t.mover ?? '';
        return (
          <div
            key={t.turnNo}
            className="log-entry"
            onClick={() => onJumpTo?.(t.turnNo)}
            title="クリックでこの局面に戻る"
          >
            <strong>#{t.turnNo}</strong> [{tag}]{' '}
            {winner === 'BLACK' ? '黒' : winner === 'WHITE' ? '白' : ''}{' '}
            {t.payment != null && t.payment > 0 ? `(-${t.payment})` : ''}{' '}
            {moveStr(t)}
            {t.cornerBonusTo && (
              <span style={{ color: 'var(--good)' }}>
                {' '}
                +角{t.cornerBonusCount ?? 1}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
