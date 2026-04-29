import React from 'react';

interface Props {
  /** Target anchor id (without `#`). */
  to: string;
  label?: string;
}

/**
 * Skip-to-content link for keyboard users. Hidden visually until focused;
 * jumps focus past the header. Place near the top of the layout.
 */
export function SkipLink({ to, label = 'メインに進む' }: Props) {
  return (
    <a className="skip-link" href={`#${to}`}>
      {label}
    </a>
  );
}
