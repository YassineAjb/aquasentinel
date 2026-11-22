import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Check, X } from 'lucide-react';

export type ConfirmKind = 'ok' | 'error' | 'info';

type ConfirmItem = {
  id: number;
  message: string;
  kind: ConfirmKind;
};

type ConfirmContextValue = {
  confirm: (message: string, kind?: ConfirmKind) => void;
};

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

const AUTO_MS = 4200;

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ConfirmItem[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const confirm = useCallback(
    (message: string, kind: ConfirmKind = 'ok') => {
      const text = message.trim();
      if (!text) return;
      const id = ++idRef.current;
      setItems((prev) => [...prev.slice(-2), { id, message: text, kind }]);
      window.setTimeout(() => dismiss(id), AUTO_MS);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ confirm }), [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <div className="confirm-stack" aria-live="polite" aria-relevant="additions">
        {items.map((item) => (
          <div
            key={item.id}
            className={`confirm-toast confirm-toast-${item.kind}`}
            role="status"
          >
            <span className="confirm-toast-icon" aria-hidden>
              {item.kind === 'error' ? (
                <X size={18} strokeWidth={2.5} />
              ) : (
                <Check size={18} strokeWidth={2.5} />
              )}
            </span>
            <p className="confirm-toast-msg">{item.message}</p>
            <button
              type="button"
              className="confirm-toast-close"
              aria-label="Close"
              onClick={() => dismiss(item.id)}
            >
              <X size={16} strokeWidth={2} aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx;
}
