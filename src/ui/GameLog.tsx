import React from 'react';
import { GameState, TurnRecord } from '../core/types';

interface Props {
  state: GameState;
  onJumpTo?: (turnNo: number) => void;
}

function moveStr(t: TurnRecord): string {
  if (!t.move) return '—';
  if (t.move === 'PASS') return 'PASS';
  const file = String.fromCharCode('A'.charCodeAt(0) + t.move.col);
  const rank = t.move.row + 1;
  return `${file}${rank}`;
}

export function GameLog({ state, onJumpTo }: Props) {
  return (
    <div className="log" aria-label="対局ログ">
      <div className="log-header">
        <strong>対局ログ</strong>
        <span className="muted">{state.history.length} ターン</span>
      </div>
      {state.history.length === 0 && (
        <div className="muted" style={{ padding: '0.6rem' }}>
          まだ着手はありません。
        </div>
      )}
      {[...state.history].reverse().map(t => {
        const winner = t.winner ?? t.mover;
        const moveColor = winner === 'BLACK' ? 'black-move' : 'white-move';
        const tieClass = t.tieBroken ? 'tie' : '';
        return (
          <div
            key={t.turnNo}
            className={`log-entry ${moveColor} ${tieClass}`}
            title={
              t.bids
                ? `黒 ${t.bids.BLACK} vs 白 ${t.bids.WHITE} → ${
                    winner === 'BLACK' ? '黒' : '白'
                  }が ${t.payment} 支払い${t.tieBroken ? '(同額・トークン移動)' : ''}`
                : t.phaseAtStart === 'FREE_MOVE'
                  ? '無償着手'
                  : '最終1手'
            }
            onClick={() => onJumpTo?.(t.turnNo)}
          >
            <span className="turn-no">#{t.turnNo}</span>
            <span>
              <span className="move-cell">{moveStr(t)}</span>
              {t.bids && (
                <span
                  style={{
                    marginLeft: '0.4rem',
                    color: 'var(--muted)',
                    fontSize: '0.78rem',
                  }}
                >
                  ({t.bids.BLACK}-{t.bids.WHITE}
                  {t.tieBroken ? '*' : ''})
                </span>
              )}
              {t.phaseAtStart === 'FREE_MOVE' && (
                <span
                  style={{
                    marginLeft: '0.3rem',
                    color: 'var(--info)',
                    fontSize: '0.78rem',
                  }}
                >
                  無償
                </span>
              )}
            </span>
            <span className="meta">
              {winner === 'BLACK' ? '⚫' : winner === 'WHITE' ? '⚪' : ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}
