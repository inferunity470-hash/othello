import React, { useEffect, useState } from 'react';
import { Color, GameState } from '../core/types';
import { evaluateBoard } from '../core/ai/eval';

interface Props {
  state: GameState;
  fromPerspective?: Color;
  showNumeric?: boolean;
}

/**
 * Visual advantage indicator. Maps the position evaluation to a vertical
 * bar: top half = my advantage, bottom half = opponent's advantage.
 *
 * The eval is recomputed cheaply on every state change. We clamp the
 * displayed value to a sensible range (-500..+500) to avoid extreme
 * spikes on terminal positions.
 */
export function EvalBar({
  state,
  fromPerspective = 'BLACK',
  showNumeric = true,
}: Props) {
  const [score, setScore] = useState(0);
  useEffect(() => {
    setScore(evaluateBoard(state.board, fromPerspective));
  }, [state.board, fromPerspective]);

  const clamped = Math.max(-500, Math.min(500, score));
  const pct = ((clamped + 500) / 1000) * 100;
  const advColor = clamped > 50 ? 'good' : clamped < -50 ? 'danger' : 'muted';
  const labelTop = fromPerspective === 'BLACK' ? '⚫ 黒' : '⚪ 白';
  const labelBottom = fromPerspective === 'BLACK' ? '⚪ 白' : '⚫ 黒';

  return (
    <div
      className="eval-bar"
      role="meter"
      aria-label="局面の優勢度"
      aria-valuemin={-500}
      aria-valuemax={500}
      aria-valuenow={clamped}
      title={`評価値 (${labelTop} POV): ${score.toFixed(0)}`}
    >
      <span className="eval-bar-label top">{labelTop}</span>
      <div className="eval-bar-track">
        <div className="eval-bar-fill" style={{ height: `${100 - pct}%` }} />
        <div className="eval-bar-mid" />
      </div>
      <span className="eval-bar-label bottom">{labelBottom}</span>
      {showNumeric && (
        <span className={`eval-bar-num ${advColor}`}>
          {score > 0 ? '+' : ''}
          {score.toFixed(0)}
        </span>
      )}
    </div>
  );
}
