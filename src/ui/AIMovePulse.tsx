import React, { useEffect, useState } from 'react';

interface Props {
  /** Cell the AI just placed on; pass `null` to hide. */
  cell: { row: number; col: number } | null;
  /** ms to keep the pulse visible. */
  durationMs?: number;
}

/**
 * Brief radial pulse rendered over a board cell to draw attention to
 * the move the AI just made. Self-clears after `durationMs`. The parent
 * is expected to position this absolutely over the board cell.
 */
export function AIMovePulse({ cell, durationMs = 1200 }: Props) {
  const [visible, setVisible] = useState<boolean>(cell != null);
  const cellKey = cell ? `${cell.row},${cell.col}` : '';
  useEffect(() => {
    if (!cellKey) {
      setVisible(false);
      return;
    }
    setVisible(true);
    const t = setTimeout(() => setVisible(false), durationMs);
    return () => clearTimeout(t);
  }, [cellKey, durationMs]);
  if (!visible || !cell) return null;
  return (
    <div
      className="ai-move-pulse"
      aria-hidden="true"
      style={{
        gridRow: cell.row + 1,
        gridColumn: cell.col + 1,
      }}
    />
  );
}
