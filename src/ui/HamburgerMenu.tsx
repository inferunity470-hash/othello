import React, { useEffect, useRef, useState } from 'react';

export interface HamburgerItem {
  key: string;
  label: React.ReactNode;
  onClick: () => void;
  active?: boolean;
}

interface Props {
  items: HamburgerItem[];
  label?: string;
}

/**
 * Compact menu that collapses a row of header buttons on narrow screens.
 * Toggle on click; auto-closes when an item fires or when clicking outside.
 */
export function HamburgerMenu({ items, label = 'メニュー' }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div className="hamburger" ref={ref}>
      <button
        className="ghost hamburger-toggle"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen(o => !o)}
      >
        ☰
      </button>
      {open && (
        <div className="hamburger-menu" role="menu">
          {items.map(it => (
            <button
              key={it.key}
              role="menuitem"
              className={it.active ? 'active' : ''}
              onClick={() => {
                setOpen(false);
                it.onClick();
              }}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
