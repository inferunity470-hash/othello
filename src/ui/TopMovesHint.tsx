import React, { useEffect, useState } from 'react';
import { Color, GameState } from '../core/types';
import { applyMove, legalMoves } from '../core/board';
import { evaluateBoard } from '../core/ai/eval';

interface Props {
  state: GameState;
  forColor: Color;
  /** Maximum number of candidate moves to show. */
  topN?: number;
}

interface Candidate {
  row: number;
  col: number;
  score: number;
  flips: number;
}

/**
 * Compact panel showing the top-N candidate moves ranked by 1-ply
 * evaluation. Always uses the same eval as the AI so users can compare
 * options without spoiling deep search.
 */
export function TopMovesHint({ state, forColor, topN = 3 }: Props) {
  const [items, setItems] = useState<Candidate[]>([]);
  useEffect(() => {
    const moves = legalMoves(state.board, forColor);
    const scored: Candidate[] = moves.map(m => {
      const result = applyMove(state.board, forColor, m.row, m.col);
      return {
        row: m.row,
        col: m.col,
        flips: result.flipped.length,
        score: evaluateBoard(result.newBoard, forColor),
      };
    });
    scored.sort((a, b) => b.score - a.score);
    setItems(scored.slice(0, topN));
  }, [state.board, forColor, topN]);

  if (items.length === 0) {
    return (
      <div className="top-moves empty muted">
        合法手なし
      </div>
    );
  }
  const best = items[0].score;
  return (
    <div className="top-moves" aria-label="候補手">
      <div className="top-moves-header">
        <strong>候補手 Top {Math.min(topN, items.length)}</strong>
        <span className="muted">1手読み</span>
      </div>
      <ol>
        {items.map((m, i) => (
          <li key={`${m.row},${m.col}`} className={i === 0 ? 'best' : ''}>
            <span className="top-moves-cell">{cellName(m.row, m.col)}</span>
            <span className="top-moves-eval">
              {m.score > 0 ? '+' : ''}
              {m.score.toFixed(0)}
            </span>
            <span className="top-moves-bar" aria-hidden="true">
              <span
                className="top-moves-bar-fill"
                style={{
                  width: `${Math.max(
                    8,
                    Math.min(100, ((m.score - best + 200) / 200) * 100)
                  )}%`,
                }}
              />
            </span>
            <span className="muted" style={{ fontSize: '0.78rem' }}>
              反転 {m.flips}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function cellName(r: number, c: number): string {
  return `${String.fromCharCode('A'.charCodeAt(0) + c)}${r + 1}`;
}
