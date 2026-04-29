import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type ToastKind = 'info' | 'good' | 'warn' | 'danger';

export interface ToastEntry {
  id: number;
  kind: ToastKind;
  text: string;
  ttl: number;
}

interface ToastShape {
  toast: (text: string, kind?: ToastKind, ttl?: number) => void;
}

const ToastCtx = createContext<ToastShape>({ toast: () => {} });

let nextId = 1;

/**
 * Lightweight toast queue. Toasts auto-dismiss after `ttl` ms (default 2400)
 * and stack vertically at the bottom of the viewport. Use `useToast()` to
 * push a notification from anywhere in the tree.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastEntry[]>([]);

  const toast = useCallback((text: string, kind: ToastKind = 'info', ttl = 2400) => {
    const id = nextId++;
    setItems(arr => [...arr, { id, kind, text, ttl }]);
  }, []);

  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div
        className="toast-stack"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {items.map(t => (
          <ToastItem
            key={t.id}
            entry={t}
            onDone={() => setItems(arr => arr.filter(x => x.id !== t.id))}
          />
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

function ToastItem({ entry, onDone }: { entry: ToastEntry; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, entry.ttl);
    return () => clearTimeout(t);
  }, [entry.ttl, onDone]);
  return (
    <div className={`toast toast-${entry.kind}`}>
      <span>{entry.text}</span>
      <button
        className="toast-close"
        aria-label="閉じる"
        onClick={onDone}
        title="閉じる"
      >
        ×
      </button>
    </div>
  );
}

export function useToast(): ToastShape {
  return useContext(ToastCtx);
}
