import React from 'react';
import { Board, GameState, TurnRecord } from '../core/types';
import { isCornerSquare, legalMoves } from '../core/board';

interface Props {
  state: GameState;
  showLegalForColor?: 'BLACK' | 'WHITE' | null;
  onCellClick?: (row: number, col: number) => void;
  showHeatmap?: boolean;
}

interface CellMeta {
  cost?: number;
  free?: boolean;
}

function buildHeatmap(history: TurnRecord[]): Map<string, CellMeta> {
  const meta = new Map<string, CellMeta>();
  for (const t of history) {
    if (!t.move || t.move === 'PASS') continue;
    const key = `${t.move.row},${t.move.col}`;
    if (t.phaseAtStart === 'BIDDING' && t.payment != null) {
      meta.set(key, { cost: t.payment });
    } else {
      meta.set(key, { free: true });
    }
  }
  return meta;
}

export function BoardView({
  state,
  showLegalForColor,
  onCellClick,
  showHeatmap,
}: Props) {
  const moves = showLegalForColor
    ? new Set(
        legalMoves(state.board, showLegalForColor).map(m => `${m.row},${m.col}`)
      )
    : new Set<string>();

  const heatmap = showHeatmap ? buildHeatmap(state.history) : null;

  return (
    <div
      className="board"
      role="grid"
      aria-label="オセロ盤"
    >
      {state.board.map((row, r) =>
        row.map((cell, c) => {
          const isLegal = moves.has(`${r},${c}`);
          const corner = isCornerSquare(r, c);
          const meta = heatmap?.get(`${r},${c}`);
          return (
            <div
              key={`${r}-${c}`}
              role="gridcell"
              aria-label={cellLabel(r, c, cell)}
              className={[
                'cell',
                corner ? 'corner' : '',
                isLegal ? 'legal legal-hint' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => isLegal && onCellClick?.(r, c)}
            >
              {cell && (
                <div
                  className={`disc ${cell === 'BLACK' ? 'black' : 'white'}`}
                  aria-hidden="true"
                >
                  {cell === 'BLACK' ? '●' : '○'}
                </div>
              )}
              {meta?.cost != null && (
                <span className="cost-badge" aria-hidden="true">
                  {meta.cost}
                </span>
              )}
              {meta?.free && (
                <span className="free-badge" aria-hidden="true">
                  無償
                </span>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

function cellLabel(r: number, c: number, cell: any) {
  const file = String.fromCharCode('A'.charCodeAt(0) + c);
  const rank = r + 1;
  if (cell === 'BLACK') return `${file}${rank} 黒石`;
  if (cell === 'WHITE') return `${file}${rank} 白石`;
  return `${file}${rank} 空`;
}
