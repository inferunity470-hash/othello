import React, { useEffect, useState } from 'react';
import { Color } from '../core/types';

interface Props {
  /** Increment to fire a new animation. */
  trigger: number;
  /** Color of the player paying chips. */
  payerColor: Color;
  /** Number of chips spent (drives label). */
  amount: number;
}

/**
 * Animates a small "chip" element flying away from the payer's HUD card
 * to a generic "pot" target above the board, accompanied by a -N label.
 * Purely cosmetic — pairs with the chip-pulse-down already in HUD.
 */
export function ChipTransferAnim({ trigger, payerColor, amount }: Props) {
  const [active, setActive] = useState(false);
  const [k, setK] = useState(0);
  useEffect(() => {
    if (trigger === 0 || amount <= 0) return;
    setActive(true);
    setK(x => x + 1);
    const t = setTimeout(() => setActive(false), 900);
    return () => clearTimeout(t);
  }, [trigger, amount]);
  if (!active) return null;
  return (
    <div className="chip-transfer-overlay" aria-hidden="true">
      <div
        key={k}
        className={`chip-transfer-icon ${payerColor === 'BLACK' ? 'from-black' : 'from-white'}`}
      >
        <span className="chip-transfer-coin">●</span>
        <span className="chip-transfer-amt">−{amount}</span>
      </div>
    </div>
  );
}
