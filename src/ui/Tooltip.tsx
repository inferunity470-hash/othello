import React, { useId, useState } from 'react';

interface Props {
  /** Term to display. The ? marker appears next to it. */
  term: React.ReactNode;
  /** Tooltip body. */
  description: React.ReactNode;
}

/**
 * Inline help tooltip. Hover or focus the small "?" badge to reveal a
 * description. Used to demystify game-jargon (e.g. "セカンドプライス").
 */
export function Tooltip({ term, description }: Props) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="tooltip-wrap">
      <span>{term}</span>
      <button
        type="button"
        className="tooltip-badge"
        aria-describedby={open ? id : undefined}
        aria-label="用語の説明"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={e => {
          e.preventDefault();
          setOpen(o => !o);
        }}
      >
        ?
      </button>
      {open && (
        <span className="tooltip-pop" role="tooltip" id={id}>
          {description}
        </span>
      )}
    </span>
  );
}
