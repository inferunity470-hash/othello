import React from 'react';
import { Color, GameState } from '../core/types';
import { legalMoves } from '../core/board';

interface Props {
  state: GameState;
  forColor: Color;
}

/**
 * Inline alert shown when `forColor` has only one legal move remaining,
 * or no legal moves at all. Helps prevent surprising forced placements
 * and signals to the human that the bid has hidden risk.
 */
export function LastLegalWarning({ state, forColor }: Props) {
  if (state.phase !== 'BIDDING' && state.phase !== 'PLACING') return null;
  const moves = legalMoves(state.board, forColor);
  if (moves.length === 0) {
    return (
      <div className="last-legal-warn danger" role="alert">
        ⚠️ <strong>{forColor === 'BLACK' ? '黒' : '白'}</strong> に合法手なし — 落札しても置けません
      </div>
    );
  }
  if (moves.length === 1) {
    const m = moves[0];
    return (
      <div className="last-legal-warn warn" role="alert">
        ⚠️ <strong>{forColor === 'BLACK' ? '黒' : '白'}</strong> の合法手は <code>
          {String.fromCharCode('A'.charCodeAt(0) + m.col)}
          {m.row + 1}
        </code> のみ — 落札後の選択肢なし
      </div>
    );
  }
  return null;
}
