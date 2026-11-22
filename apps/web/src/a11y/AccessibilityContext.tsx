import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

/** Bigger text / tap targets (legacy key migrated from sakiya-a11y) */
export const EASY_READ_STORAGE_KEY = 'sakiya-easy-read';
/** Stronger colors only — independent of text size */
export const CONTRAST_STORAGE_KEY = 'sakiya-high-contrast';
/** @deprecated migrated to EASY_READ_STORAGE_KEY */
export const A11Y_STORAGE_KEY = 'sakiya-a11y';

type AccessibilityContextValue = {
  easyRead: boolean;
  highContrast: boolean;
  setEasyRead: (on: boolean) => void;
  setHighContrast: (on: boolean) => void;
  toggleEasyRead: () => void;
  toggleHighContrast: () => void;
  /** @deprecated use easyRead */
  a11y: boolean;
  /** @deprecated use setEasyRead */
  setA11y: (on: boolean) => void;
  /** @deprecated use toggleEasyRead */
  toggleA11y: () => void;
};

const AccessibilityContext = createContext<AccessibilityContextValue | null>(
  null,
);

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(key: string, on: boolean) {
  try {
    localStorage.setItem(key, on ? '1' : '0');
  } catch {
    /* ignore */
  }
}

function readEasyRead(): boolean {
  try {
    const next = localStorage.getItem(EASY_READ_STORAGE_KEY);
    if (next === '1' || next === '0') return next === '1';
    /* migrate old combined a11y toggle → easy read */
    const legacy = localStorage.getItem(A11Y_STORAGE_KEY);
    if (legacy === '1') {
      writeFlag(EASY_READ_STORAGE_KEY, true);
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

function applyEasyRead(on: boolean) {
  document.documentElement.setAttribute('data-a11y', on ? 'on' : 'off');
}

function applyHighContrast(on: boolean) {
  document.documentElement.setAttribute('data-contrast', on ? 'on' : 'off');
}

export function AccessibilityProvider({ children }: { children: ReactNode }) {
  const [easyRead, setEasyReadState] = useState(() => {
    const initial = readEasyRead();
    applyEasyRead(initial);
    return initial;
  });
  const [highContrast, setHighContrastState] = useState(() => {
    const initial = readFlag(CONTRAST_STORAGE_KEY);
    applyHighContrast(initial);
    return initial;
  });

  const setEasyRead = useCallback((on: boolean) => {
    setEasyReadState(on);
    applyEasyRead(on);
    writeFlag(EASY_READ_STORAGE_KEY, on);
  }, []);

  const setHighContrast = useCallback((on: boolean) => {
    setHighContrastState(on);
    applyHighContrast(on);
    writeFlag(CONTRAST_STORAGE_KEY, on);
  }, []);

  const toggleEasyRead = useCallback(() => {
    setEasyRead(!easyRead);
  }, [easyRead, setEasyRead]);

  const toggleHighContrast = useCallback(() => {
    setHighContrast(!highContrast);
  }, [highContrast, setHighContrast]);

  useEffect(() => {
    applyEasyRead(easyRead);
  }, [easyRead]);

  useEffect(() => {
    applyHighContrast(highContrast);
  }, [highContrast]);

  const value = useMemo(
    () => ({
      easyRead,
      highContrast,
      setEasyRead,
      setHighContrast,
      toggleEasyRead,
      toggleHighContrast,
      a11y: easyRead,
      setA11y: setEasyRead,
      toggleA11y: toggleEasyRead,
    }),
    [
      easyRead,
      highContrast,
      setEasyRead,
      setHighContrast,
      toggleEasyRead,
      toggleHighContrast,
    ],
  );

  return (
    <AccessibilityContext.Provider value={value}>
      {children}
    </AccessibilityContext.Provider>
  );
}

export function useAccessibility() {
  const ctx = useContext(AccessibilityContext);
  if (!ctx) {
    throw new Error('useAccessibility must be used within AccessibilityProvider');
  }
  return ctx;
}
