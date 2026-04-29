import React, { useEffect, useState } from 'react';
import { getPref, setPref } from './storage';

export type Theme = 'dark' | 'light';

function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme;
}

/**
 * Persistent dark/light theme toggle. Reads from the same `pref` storage
 * as the rest of the app so the choice survives reloads. Idempotently
 * applies `data-theme` to the document root.
 */
export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(
    () => (getPref('theme', 'dark') as Theme) ?? 'dark'
  );
  useEffect(() => {
    applyTheme(theme);
    setPref('theme', theme);
  }, [theme]);
  return [theme, setTheme];
}

interface Props {
  theme: Theme;
  onChange: (t: Theme) => void;
}

export function ThemeToggle({ theme, onChange }: Props) {
  return (
    <button
      className="ghost theme-toggle"
      onClick={() => onChange(theme === 'dark' ? 'light' : 'dark')}
      aria-label="テーマ切替"
      title={theme === 'dark' ? 'ライトモードへ' : 'ダークモードへ'}
    >
      {theme === 'dark' ? '☀️ ライト' : '🌙 ダーク'}
    </button>
  );
}
