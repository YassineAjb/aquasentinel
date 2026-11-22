import type { Locale } from '../i18n/locales';

type Props = {
  locale: Locale;
  className?: string;
  title?: string;
};

/** Flag icons — SVG for EN/JP; TN uses the official flag asset (Windows-safe). */
export default function FlagIcon({ locale, className = '', title }: Props) {
  const wrapClass = `lang-flag-svg${className ? ` ${className}` : ''}`;

  if (locale === 'ar') {
    return (
      <img
        className={wrapClass}
        src="/flags/tn.png"
        alt={title || ''}
        width={18}
        height={12}
        draggable={false}
        aria-hidden={title ? undefined : true}
      />
    );
  }

  const common = {
    className: wrapClass,
    width: 18,
    height: 14,
    viewBox: '0 0 18 14',
    role: 'img' as const,
    'aria-hidden': title ? undefined : true,
    focusable: false as const,
  };

  if (locale === 'en') {
    return (
      <svg {...common} aria-label={title}>
        {title ? <title>{title}</title> : null}
        <rect width="18" height="14" rx="2" fill="#012169" />
        <path d="M0 0 L18 14 M18 0 L0 14" stroke="#fff" strokeWidth="2.4" />
        <path d="M0 0 L18 14 M18 0 L0 14" stroke="#C8102E" strokeWidth="1.2" />
        <path d="M9 0 V14 M0 7 H18" stroke="#fff" strokeWidth="4" />
        <path d="M9 0 V14 M0 7 H18" stroke="#C8102E" strokeWidth="2.2" />
      </svg>
    );
  }

  return (
    <svg {...common} aria-label={title}>
      {title ? <title>{title}</title> : null}
      <rect width="18" height="14" rx="2" fill="#fff" stroke="rgba(0,0,0,.12)" />
      <circle cx="9" cy="7" r="3.35" fill="#BC002D" />
    </svg>
  );
}
