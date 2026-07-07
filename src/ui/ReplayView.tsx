import React, { useMemo, useState } from 'react';
import { GameState, TurnRecord } from '../core/types';
import { rewindTo } from '../core/events';
import { BoardView } from './Board';

interface Props {
  finalState: GameState;
  onClose: () => void;
}

/**
 * Step through past turns of a finished game.
 * Spec §13.5: replay viewer with arbitrary turn jump and step controls.
 */
export function ReplayView({ finalState, onClose }: Props) {
  const total = finalState.history.length;
  const [turnIdx, setTurnIdx] = useState(total);
  const previewState: GameState = useMemo(
    () =>
      turnIdx === total
        ? finalState
        : rewindTo(finalState.options, finalState.history, turnIdx),
    [turnIdx, finalState, total]
  );

  const goPrev = () => setTurnIdx(t => Math.max(0, t - 1));
  const goNext = () => setTurnIdx(t => Math.min(total, t + 1));
  const goStart = () => setTurnIdx(0);
  const goEnd = () => setTurnIdx(total);

  const turn: TurnRecord | undefined =
    turnIdx > 0 ? finalState.history[turnIdx - 1] : undefined;

  return (
    <div className="overlay" onClick={onClose} role="dialog" aria-label="リプレイ">
      <div
        className="overlay-card"
        style={{ maxWidth: 720 }}
        onClick={e => e.stopPropagation()}
      >
        <h2>📽 リプレイビューワ</h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) 1fr',
            gap: '0.8rem',
            alignItems: 'start',
          }}
          className="replay-grid"
        >
          <BoardView state={previewState} showHeatmap={false} />
          <div className="col" style={{ gap: '0.4rem' }}>
            <div className="muted">
              ターン {turnIdx} / {total}
            </div>
            {turn ? (
              <div className="bid-panel" style={{ padding: '0.6rem' }}>
                <div>
                  <strong>#{turn.turnNo}</strong>{' '}
                  {turn.phaseAtStart === 'BIDDING'
                    ? '入札ターン'
                    : turn.phaseAtStart === 'FREE_MOVE'
                      ? '無償着手'
                      : '最終1手'}
                </div>
                {turn.bids && (
                  <div className="muted">
                    入札:黒 {turn.bids.BLACK} / 白 {turn.bids.WHITE}
                    {turn.tieBroken && ' (同額・トークン移動)'}
                  </div>
                )}
                {turn.payment != null && turn.winner && (
                  <div className="muted">
                    {turn.winner === 'BLACK' ? '黒' : '白'}が {turn.payment} 支払い
                  </div>
                )}
                {turn.move && turn.move !== 'PASS' && (
                  <div>
                    着手: <strong>{moveStr(turn)}</strong>{' '}
                    {turn.flipped && (
                      <span className="muted">(反転 {turn.flipped.length})</span>
                    )}
                  </div>
                )}
                <div className="muted">
                  チップ:黒 {turn.chipsAfter.BLACK} / 白 {turn.chipsAfter.WHITE}
                </div>
              </div>
            ) : (
              <div className="bid-panel" style={{ padding: '0.6rem' }}>
                <div>初期局面</div>
              </div>
            )}
          </div>
        </div>
        <div className="row" style={{ justifyContent: 'center' }}>
          <button onClick={goStart} disabled={turnIdx === 0} aria-label="最初へ">
            ⏮ 開始
          </button>
          <button onClick={goPrev} disabled={turnIdx === 0} aria-label="一手戻る">
            ◀ 前
          </button>
          <input
            type="range"
            min={0}
            max={total}
            value={turnIdx}
            onChange={e => setTurnIdx(parseInt(e.target.value, 10))}
            style={{ flex: 1, minWidth: 140 }}
            aria-label="ターン"
          />
          <button onClick={goNext} disabled={turnIdx === total} aria-label="一手進む">
            次 ▶
          </button>
          <button onClick={goEnd} disabled={turnIdx === total} aria-label="最後へ">
            最終 ⏭
          </button>
        </div>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button onClick={onClose}>閉じる</button>
        </div>
      </div>
    </div>
  );
}

function moveStr(t: TurnRecord): string {
  if (!t.move || t.move === 'PASS') return '—';
  const file = String.fromCharCode('A'.charCodeAt(0) + t.move.col);
  const rank = t.move.row + 1;
  return `${file}${rank}`;
}
