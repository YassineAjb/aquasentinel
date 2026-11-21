import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  LOCALES,
  LOCALE_STORAGE_KEY,
  assistantLangFor,
  translate,
  type Locale,
} from './locales';

type LanguageContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  dir: 'ltr' | 'rtl';
  assistantLang: string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

function readStoredLocale(): Locale {
  try {
    const raw = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (raw === 'en' || raw === 'ar' || raw === 'ja') return raw;
  } catch {
    /* ignore */
  }
  const nav = (navigator.language || '').toLowerCase();
  if (nav.startsWith('ar')) return 'ar';
  if (nav.startsWith('ja')) return 'ja';
  return 'en';
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readStoredLocale);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const dir = LOCALES.find((l) => l.id === locale)?.dir ?? 'ltr';

  useEffect(() => {
    document.documentElement.lang = locale === 'ar' ? 'ar' : locale;
    document.documentElement.dir = dir;
  }, [locale, dir]);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) =>
      translate(locale, key, vars),
    [locale],
  );

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      t,
      dir,
      assistantLang: assistantLangFor(locale),
    }),
    [locale, setLocale, t, dir],
  );

  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
