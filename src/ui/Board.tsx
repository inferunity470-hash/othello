import React, { useEffect, useRef, useState } from 'react';
import { Board, Color, GameState, TurnRecord } from '../core/types';
import { isCornerSquare, legalMoves } from '../core/board';

interface Props {
  state: GameState;
  showLegalForColor?: Color | null;
  onCellClick?: (row: number, col: number) => void;
  showHeatmap?: boolean;
}

interface CellMeta {
  cost?: number;
  free?: boolean;
  turnNo?: number;
  byColor?: Color;
  flips?: number;
}

interface HoverDetail {
  row: number;
  col: number;
  meta: CellMeta;
}

function buildHeatmap(history: TurnRecord[]): Map<string, CellMeta> {
  const meta = new Map<string, CellMeta>();
  for (const t of history) {
    if (!t.move || t.move === 'PASS') continue;
    const key = `${t.move.row},${t.move.col}`;
    const flips = t.flipped?.length ?? 0;
    if (t.phaseAtStart === 'BIDDING' && t.payment != null) {
      meta.set(key, {
        cost: t.payment,
        turnNo: t.turnNo,
        byColor: t.mover ?? t.winner,
        flips,
      });
    } else {
      meta.set(key, {
        free: true,
        turnNo: t.turnNo,
        byColor: t.mover,
        flips,
      });
    }
  }
  return meta;
}

function lastMoveCell(history: TurnRecord[]): { row: number; col: number } | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const t = history[i];
    if (t.move && t.move !== 'PASS') return t.move;
  }
  return null;
}

function lastFlipsSet(history: TurnRecord[]): Set<string> {
  const last = history[history.length - 1];
  if (!last?.flipped) return new Set();
  return new Set(last.flipped.map(([r, c]) => `${r},${c}`));
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
  const last = lastMoveCell(state.history);
  const lastFlips = lastFlipsSet(state.history);
  const [hover, setHover] = useState<HoverDetail | null>(null);

  // Track which cells just changed to drive flip animations
  const prevBoardRef = useRef<Board | null>(null);
  const [animFlips, setAnimFlips] = useState<Set<string>>(new Set());
  const [animPlace, setAnimPlace] = useState<string | null>(null);

  useEffect(() => {
    const prev = prevBoardRef.current;
    if (!prev) {
      prevBoardRef.current = state.board;
      return;
    }
    const flips = new Set<string>();
    let placed: string | null = null;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const before = prev[r][c];
        const after = state.board[r][c];
        if (before !== after) {
          if (before === null && after !== null) {
            placed = `${r},${c}`;
          } else if (before !== null && after !== null && before !== after) {
            flips.add(`${r},${c}`);
          }
        }
      }
    }
    if (flips.size > 0) setAnimFlips(flips);
    setAnimPlace(placed);
    prevBoardRef.current = state.board;
    const t = setTimeout(() => {
      setAnimFlips(new Set());
      setAnimPlace(null);
    }, 480);
    return () => clearTimeout(t);
  }, [state.board]);

  return (
    <div className="board-frame">
      <div className="board" role="grid" aria-label="オセロ盤">
        {state.board.map((row, r) =>
          row.map((cell, c) => {
            const key = `${r},${c}`;
            const isLegal = moves.has(key);
            const corner = isCornerSquare(r, c);
            const meta = heatmap?.get(key);
            const isLast = last && last.row === r && last.col === c;
            const dark = (r + c) % 2 === 1;
            const isFlipping = animFlips.has(key);
            const isPlaced = animPlace === key;
            return (
              <div
                key={key}
                role="gridcell"
                aria-label={cellLabel(r, c, cell)}
                className={[
                  'cell',
                  dark ? 'dark' : '',
                  corner ? 'corner' : '',
                  isLegal ? 'legal legal-hint' : '',
                  isLast ? 'last-move' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => isLegal && onCellClick?.(r, c)}
                onMouseEnter={() =>
                  meta && setHover({ row: r, col: c, meta })
                }
                onMouseLeave={() => setHover(null)}
              >
                {cell && (
                  <div className="disc-holder">
                    <div
                      className={`disc ${cell === 'BLACK' ? 'black' : 'white'} ${
                        isFlipping ? 'flipping' : ''
                      } ${isPlaced ? 'placed' : ''}`}
                      aria-hidden="true"
                    >
                      <span className="disc-mark">
                        {cell === 'BLACK' ? '●' : '○'}
                      </span>
                    </div>
                  </div>
                )}
                {meta?.cost != null && (
                  <span className="cost-badge" aria-hidden="true">
                    {meta.cost}
                  </span>
                )}
                {meta?.free && (
                  <span className="free-badge" aria-hidden="true">
                    無
                  </span>
                )}
                {hover &&
                  hover.row === r &&
                  hover.col === c &&
                  meta && (
                    <div className="heatmap-tooltip" role="tooltip">
                      ターン {meta.turnNo} ・{' '}
                      {meta.byColor === 'BLACK' ? '黒' : '白'}{' '}
                      {meta.cost != null
                        ? `落札 ${meta.cost}`
                        : '無償着手'}{' '}
                      ・ 反転 {meta.flips ?? 0}
                    </div>
                  )}
              </div>
            );
          })
        )}
      </div>
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
