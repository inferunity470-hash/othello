import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Locale, t as lookup } from './messages';
import { getPref, setPref } from '../ui/storage';

interface I18nContextShape {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: Parameters<typeof lookup>[1]) => string;
}

const I18nContext = createContext<I18nContextShape | null>(null);

function detectInitial(): Locale {
  const saved = getPref('lang', '') as Locale | '';
  if (saved === 'ja' || saved === 'en') return saved;
  if (typeof navigator !== 'undefined') {
    const langs = navigator.languages ?? [navigator.language ?? 'ja'];
    for (const l of langs) {
      const lc = (l ?? '').toLowerCase();
      if (lc.startsWith('ja')) return 'ja';
      if (lc.startsWith('en')) return 'en';
    }
  }
  return 'ja';
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => detectInitial());
  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    setPref('lang', l);
    if (typeof document !== 'undefined') {
      document.documentElement.lang = l;
    }
  }, []);
  const value = useMemo<I18nContextShape>(
    () => ({
      locale,
      setLocale,
      t: key => lookup(locale, key),
    }),
    [locale, setLocale]
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextShape {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    // Fallback: bare-minimum usage outside provider returns ja
    return {
      locale: 'ja',
      setLocale: () => {},
      t: key => lookup('ja', key),
    };
  }
  return ctx;
}

export type { Locale } from './messages';
