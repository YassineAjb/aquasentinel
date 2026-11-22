import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export const A11Y_STORAGE_KEY = 'sakiya-a11y';

type AccessibilityContextValue = {
  a11y: boolean;
  setA11y: (on: boolean) => void;
  toggleA11y: () => void;
};

const AccessibilityContext = createContext<AccessibilityContextValue | null>(
  null,
);

function readStoredA11y(): boolean {
  try {
    return localStorage.getItem(A11Y_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function applyA11y(on: boolean) {
  document.documentElement.setAttribute('data-a11y', on ? 'on' : 'off');
}

export function AccessibilityProvider({ children }: { children: ReactNode }) {
  const [a11y, setA11yState] = useState(() => {
    const initial = readStoredA11y();
    applyA11y(initial);
    return initial;
  });

  const setA11y = useCallback((on: boolean) => {
    setA11yState(on);
    applyA11y(on);
    try {
      localStorage.setItem(A11Y_STORAGE_KEY, on ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, []);

  const toggleA11y = useCallback(() => {
    setA11y(!a11y);
  }, [a11y, setA11y]);

  useEffect(() => {
    applyA11y(a11y);
  }, [a11y]);

  const value = useMemo(
    () => ({ a11y, setA11y, toggleA11y }),
    [a11y, setA11y, toggleA11y],
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
