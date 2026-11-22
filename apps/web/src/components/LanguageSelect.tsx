import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { LOCALES, useLanguage, type Locale } from '../i18n';
import FlagIcon from './FlagIcon';

type Props = {
  className?: string;
  compact?: boolean;
};

export default function LanguageSelect({ className = '', compact = false }: Props) {
  const { t, locale, setLocale } = useLanguage();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const current = LOCALES.find((l) => l.id === locale) ?? LOCALES[0];

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div
      className={`lang-select${compact ? ' is-compact' : ''}${open ? ' is-open' : ''}${className ? ` ${className}` : ''}`}
      ref={rootRef}
    >
      <button
        type="button"
        className="lang-select-trigger"
        aria-label={t('nav.language')}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        title={current.label}
        onClick={() => setOpen((v) => !v)}
      >
        <FlagIcon locale={current.id} />
        {!compact && <span className="lang-select-label">{current.label}</span>}
        <ChevronDown size={14} strokeWidth={2.2} aria-hidden />
      </button>

      {open && (
        <ul
          id={listId}
          className="lang-select-menu"
          role="listbox"
          aria-label={t('nav.language')}
        >
          {LOCALES.map((l) => (
            <li key={l.id} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={l.id === locale}
                className={`lang-select-option${l.id === locale ? ' is-active' : ''}`}
                onClick={() => {
                  setLocale(l.id as Locale);
                  setOpen(false);
                }}
              >
                <FlagIcon locale={l.id} />
                <span>{l.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
