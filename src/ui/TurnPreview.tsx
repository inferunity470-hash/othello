import React, { useMemo } from 'react';
import { GameState } from '../core/types';
import { rewindTo } from '../core/events';
import { BoardView } from './Board';
import { FocusTrap } from './FocusTrap';

interface Props {
  finalState: GameState;
  /** 1-indexed turn number to preview. */
  turnNo: number;
  onClose: () => void;
}

/**
 * Lightweight modal that shows the board state immediately *after* a
 * specific turn — for clicking a row in the GameLog. Distinct from the
 * full ReplayView (which includes step controls).
 */
export function TurnPreview({ finalState, turnNo, onClose }: Props) {
  const previewState = useMemo(
    () => rewindTo(finalState.options, finalState.history, turnNo),
    [finalState, turnNo]
  );
  const turn = finalState.history[turnNo - 1];
  return (
    <div
      className="overlay"
      role="dialog"
      aria-label={`ターン ${turnNo} のプレビュー`}
      onClick={onClose}
    >
      <FocusTrap onEscape={onClose} autoFocusSelector="button">
        <div
          className="overlay-card"
          style={{ maxWidth: 540 }}
          onClick={e => e.stopPropagation()}
        >
          <h2 style={{ marginTop: 0 }}>
            🔍 ターン #{turn?.turnNo ?? turnNo} プレビュー
          </h2>
          <BoardView state={previewState} readOnly hideLabels showHeatmap={false} />
          {turn && (
            <div className="muted" style={{ marginTop: '0.6rem' }}>
              {turn.bids && (
                <>
                  入札:黒 <strong>{turn.bids.BLACK}</strong> / 白{' '}
                  <strong>{turn.bids.WHITE}</strong>
                  {turn.tieBroken && ' (同額)'}
                  {' ・ '}
                </>
              )}
              {turn.move && turn.move !== 'PASS' && (
                <>
                  着手 <strong>{moveStr(turn.move.row, turn.move.col)}</strong>
                  {turn.flipped && <> (反転 {turn.flipped.length})</>}
                </>
              )}
              {turn.cornerBonusTo && (
                <>
                  {' ・ '}+角 {turn.cornerBonusCount ?? 1}
                </>
              )}
            </div>
          )}
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button onClick={onClose}>閉じる (Esc)</button>
          </div>
        </div>
      </FocusTrap>
    </div>
  );
}

function moveStr(r: number, c: number): string {
  return `${String.fromCharCode('A'.charCodeAt(0) + c)}${r + 1}`;
}
