import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Board, Color, GameState, TurnRecord } from '../core/types';
import { getFlips, isCornerSquare, legalMoves } from '../core/board';
import { play as playSound } from './sound';

interface Props {
  state: GameState;
  showLegalForColor?: Color | null;
  onCellClick?: (row: number, col: number) => void;
  showHeatmap?: boolean;
  /** Override which cell is highlighted as "last move" (used in replay). */
  lastMoveOverride?: { row: number; col: number } | null;
  /** Disable interactions completely (used during preview/replay). */
  readOnly?: boolean;
  /** Highlight a single suggested cell (e.g. AI hint). */
  hintCell?: { row: number; col: number } | null;
  /** Hide the file/rank labels around the board. */
  hideLabels?: boolean;
}

const FILES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8'];

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

export function BoardView({
  state,
  showLegalForColor,
  onCellClick,
  showHeatmap,
  lastMoveOverride,
  readOnly,
  hintCell,
  hideLabels,
}: Props) {
  // Memoize legal moves so we don't recompute on every hover/animation tick.
  const moves = useMemo(() => {
    if (!showLegalForColor || readOnly) return new Set<string>();
    return new Set(
      legalMoves(state.board, showLegalForColor).map(m => `${m.row},${m.col}`)
    );
  }, [state.board, showLegalForColor, readOnly]);

  const heatmap = useMemo(
    () => (showHeatmap ? buildHeatmap(state.history) : null),
    [showHeatmap, state.history]
  );
  const last =
    lastMoveOverride !== undefined ? lastMoveOverride : lastMoveCell(state.history);
  const [hover, setHover] = useState<HoverDetail | null>(null);
  const [hoverFlips, setHoverFlips] = useState<Set<string>>(new Set());

  // Animation tracking
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
    // Subtle SFX: place tone, plus a softer flip tone if any stones flipped.
    if (placed != null) {
      playSound('place');
      if (flips.size > 0) {
        // small delay so the two tones don't smear
        setTimeout(() => playSound('flip'), 70);
      }
    }
    const t = setTimeout(() => {
      setAnimFlips(new Set());
      setAnimPlace(null);
    }, 480);
    return () => clearTimeout(t);
  }, [state.board]);

  // Keyboard navigation
  const [focus, setFocus] = useState<{ row: number; col: number } | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);

  const handleCellHover = (r: number, c: number) => {
    const key = `${r},${c}`;
    const meta = heatmap?.get(key);
    if (meta) setHover({ row: r, col: c, meta });
    // Show flip preview if this is a legal move
    if (showLegalForColor && moves.has(key) && !readOnly) {
      const flips = getFlips(state.board, showLegalForColor, r, c);
      setHoverFlips(new Set(flips.map(([fr, fc]) => `${fr},${fc}`)));
    } else {
      setHoverFlips(new Set());
    }
  };

  const handleCellLeave = () => {
    setHover(null);
    setHoverFlips(new Set());
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLDivElement>,
    r: number,
    c: number
  ) => {
    let nr = r;
    let nc = c;
    switch (e.key) {
      case 'ArrowUp':
        nr = Math.max(0, r - 1);
        break;
      case 'ArrowDown':
        nr = Math.min(7, r + 1);
        break;
      case 'ArrowLeft':
        nc = Math.max(0, c - 1);
        break;
      case 'ArrowRight':
        nc = Math.min(7, c + 1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (moves.has(`${r},${c}`)) onCellClick?.(r, c);
        return;
      default:
        return;
    }
    e.preventDefault();
    setFocus({ row: nr, col: nc });
    const next = boardRef.current?.querySelector<HTMLDivElement>(
      `[data-row="${nr}"][data-col="${nc}"]`
    );
    next?.focus();
  };

  return (
    <div className="board-frame">
      {!hideLabels && (
        <>
          <div className="board-files" aria-hidden="true">
            {FILES.map(f => (
              <span key={f}>{f}</span>
            ))}
          </div>
          <div className="board-ranks" aria-hidden="true">
            {RANKS.map(r => (
              <span key={r}>{r}</span>
            ))}
          </div>
        </>
      )}
      <div className="board" role="grid" aria-label="オセロ盤" ref={boardRef}>
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
            const willFlip = hoverFlips.has(key);
            const isHint = hintCell && hintCell.row === r && hintCell.col === c;
            return (
              <div
                key={key}
                role="gridcell"
                aria-label={cellLabel(r, c, cell)}
                data-row={r}
                data-col={c}
                tabIndex={isLegal ? 0 : -1}
                onKeyDown={e => handleKeyDown(e, r, c)}
                className={[
                  'cell',
                  dark ? 'dark' : '',
                  corner ? 'corner' : '',
                  isLegal ? 'legal legal-hint' : '',
                  isLast ? 'last-move' : '',
                  willFlip ? 'will-flip' : '',
                  isHint ? 'hint' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => isLegal && !readOnly && onCellClick?.(r, c)}
                onMouseEnter={() => handleCellHover(r, c)}
                onMouseLeave={handleCellLeave}
                onFocus={() => handleCellHover(r, c)}
                onBlur={handleCellLeave}
              >
                {cell && (
                  <div className="disc-holder">
                    <div
                      className={`disc ${cell === 'BLACK' ? 'black' : 'white'} ${
                        isFlipping ? 'flipping' : ''
                      } ${isPlaced ? 'placed' : ''} ${willFlip ? 'will-flip' : ''}`}
                      aria-hidden="true"
                    >
                      <span className="disc-mark">{cell === 'BLACK' ? '●' : '○'}</span>
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
                {hover && hover.row === r && hover.col === c && meta && (
                  <div className="heatmap-tooltip" role="tooltip">
                    ターン {meta.turnNo} ・ {meta.byColor === 'BLACK' ? '黒' : '白'}{' '}
                    {meta.cost != null ? `落札 ${meta.cost}` : '無償着手'} ・ 反転{' '}
                    {meta.flips ?? 0}
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
