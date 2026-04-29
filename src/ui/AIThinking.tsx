import React, { useEffect, useState } from 'react';

interface Props {
  active: boolean;
  label?: string;
}

/**
 * Animated indicator showing the AI is currently computing. After a short
 * grace period (so flicker isn't visible for fast moves) the bar appears
 * and pulses.
 */
export function AIThinking({ active, label = 'NPC が思考中...' }: Props) {
  const [visible, setVisible] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!active) {
      setVisible(false);
      setElapsed(0);
      return;
    }
    const start = performance.now();
    const showTimer = setTimeout(() => setVisible(true), 200);
    const tickTimer = setInterval(() => {
      setElapsed(Math.floor((performance.now() - start) / 100) / 10);
    }, 100);
    return () => {
      clearTimeout(showTimer);
      clearInterval(tickTimer);
    };
  }, [active]);
  if (!visible) return null;
  return (
    <div className="ai-thinking" role="status" aria-live="polite">
      <span className="spinner" />
      <span>{label}</span>
      <span className="ai-thinking-elapsed">{elapsed.toFixed(1)}s</span>
      <div className="ai-thinking-bar">
        <div className="ai-thinking-bar-fill" />
      </div>
    </div>
  );
}
