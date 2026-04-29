import React, { useEffect, useState } from 'react';
import { Color } from '../core/types';

interface Props {
  /** Set when the holder should change. The component animates and clears. */
  trigger: number;
  fromColor: Color;
  toColor: Color;
}

/**
 * Plays a brief animation showing the initiative token "flying" from
 * `fromColor` to `toColor`. Increment `trigger` to fire it.
 */
export function TokenTransferAnim({ trigger, fromColor, toColor }: Props) {
  const [active, setActive] = useState(false);
  const [key, setKey] = useState(0);
  useEffect(() => {
    if (trigger === 0) return;
    setActive(true);
    setKey(k => k + 1);
    const t = setTimeout(() => setActive(false), 900);
    return () => clearTimeout(t);
  }, [trigger]);
  if (!active) return null;
  return (
    <div className="token-transfer-overlay" aria-hidden="true">
      <div
        key={key}
        className={`token-transfer-icon from-${fromColor.toLowerCase()} to-${toColor.toLowerCase()}`}
      >
        ★
      </div>
    </div>
  );
}
