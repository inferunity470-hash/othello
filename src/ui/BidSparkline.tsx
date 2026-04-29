import React from 'react';
import { TurnRecord } from '../core/types';

interface Props {
  history: TurnRecord[];
  width?: number;
  height?: number;
}

/**
 * Tiny SVG sparkline of bid history per color. Helpful for spotting
 * patterns ("opponent always bids ~half") at a glance.
 */
export function BidSparkline({ history, width = 220, height = 56 }: Props) {
  const points: Array<{ b: number; w: number }> = [];
  for (const t of history) {
    if (t.bids) points.push({ b: t.bids.BLACK, w: t.bids.WHITE });
  }
  if (points.length < 2) {
    return (
      <div className="sparkline empty muted">
        入札履歴 ― 2 ターン以上で表示されます
      </div>
    );
  }
  const max = Math.max(1, ...points.flatMap(p => [p.b, p.w]));
  const stepX = points.length > 1 ? width / (points.length - 1) : width;
  const path = (key: 'b' | 'w') =>
    points
      .map((p, i) => {
        const x = i * stepX;
        const y = height - (p[key] / max) * (height - 4) - 2;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  const blackPath = path('b');
  const whitePath = path('w');
  return (
    <svg
      className="sparkline"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label="入札履歴スパークライン"
    >
      <path d={blackPath} className="sparkline-black" />
      <path d={whitePath} className="sparkline-white" />
    </svg>
  );
}
