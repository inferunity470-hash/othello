import React, { useEffect, useRef } from 'react';

interface Props {
  active?: boolean;
  onEscape?: () => void;
  children: React.ReactNode;
  /** Initial element to focus on mount. */
  autoFocusSelector?: string;
}

/**
 * Trap focus inside the wrapped element while `active`. Restores focus
 * to the previously focused element on unmount. Calls onEscape on Esc.
 */
export function FocusTrap({
  active = true,
  onEscape,
  children,
  autoFocusSelector,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const prevActive = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    prevActive.current =
      typeof document !== 'undefined'
        ? (document.activeElement as HTMLElement | null)
        : null;

    const root = ref.current;
    if (!root) return;
    // Auto-focus a target inside, falling back to first focusable element
    const initial =
      (autoFocusSelector
        ? root.querySelector<HTMLElement>(autoFocusSelector)
        : null) ?? firstFocusable(root);
    initial?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onEscape) {
        e.preventDefault();
        onEscape();
        return;
      }
      if (e.key !== 'Tab') return;
      const focusables = focusableEls(root);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const activeEl = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (activeEl === first || !root.contains(activeEl)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (activeEl === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      // Restore focus to prior element
      prevActive.current?.focus?.();
    };
  }, [active, onEscape, autoFocusSelector]);

  return (
    <div ref={ref} tabIndex={-1} style={{ outline: 'none' }}>
      {children}
    </div>
  );
}

function firstFocusable(root: HTMLElement): HTMLElement | null {
  return focusableEls(root)[0] ?? null;
}

function focusableEls(root: HTMLElement): HTMLElement[] {
  const sel =
    'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  return Array.from(root.querySelectorAll<HTMLElement>(sel)).filter(
    el =>
      !el.hasAttribute('disabled') &&
      el.getAttribute('aria-hidden') !== 'true'
  );
}
