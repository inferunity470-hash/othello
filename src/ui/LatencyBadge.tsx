import React from 'react';

interface Props {
  /** Latest one-way latency estimate in milliseconds, or null when unknown. */
  latencyMs: number | null;
  connected: boolean;
}

/**
 * Small connection-quality pill for online play. Color-coded by latency
 * and turns red when disconnected. Render alongside other HUD pills.
 */
export function LatencyBadge({ latencyMs, connected }: Props) {
  if (!connected) {
    return (
      <span className="pill latency-badge danger" title="サーバーから切断されました">
        🔴 オフライン
      </span>
    );
  }
  if (latencyMs == null) {
    return (
      <span className="pill latency-badge muted" title="計測中">
        ⏳ 計測中
      </span>
    );
  }
  const cls =
    latencyMs < 80 ? 'good' : latencyMs < 200 ? '' : latencyMs < 400 ? 'warn' : 'danger';
  const dots =
    latencyMs < 80 ? '🟢' : latencyMs < 200 ? '🟡' : latencyMs < 400 ? '🟠' : '🔴';
  return (
    <span className={`pill latency-badge ${cls}`} title={`往復遅延 ≈ ${latencyMs} ms`}>
      {dots} {latencyMs} ms
    </span>
  );
}
