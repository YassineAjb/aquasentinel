import { useEffect, useRef, useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { translateCsrxPanel } from '../csrxPanelI18n';
import { useLanguage } from '../i18n';
import type { Locale } from '../i18n/locales';

export const CUTSHEETRX_URL = 'https://www.senterfarms.com/programs/csrx/';
/** Proxied same-origin copy — original page content, panel labels translatable */
const EMBED_SRC = '/csrx-embed/';

export default function CutSheetRX() {
  const { t, locale } = useLanguage();
  const [key, setKey] = useState(0);
  const [blocked, setBlocked] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const observerRef = useRef<MutationObserver | null>(null);
  const localeRef = useRef<Locale>(locale);
  localeRef.current = locale;

  function reload() {
    setBlocked(false);
    observerRef.current?.disconnect();
    observerRef.current = null;
    setKey((k) => k + 1);
  }

  function applyPanelI18n(next: Locale = localeRef.current) {
    const doc = iframeRef.current?.contentDocument;
    if (!doc?.body) return;
    try {
      translateCsrxPanel(doc, next);
    } catch {
      /* cross-origin or not ready */
    }
  }

  useEffect(() => {
    applyPanelI18n(locale);
  }, [locale, key]);

  function onFrameLoad() {
    const doc = iframeRef.current?.contentDocument;
    if (!doc?.body) return;

    applyPanelI18n(localeRef.current);
    observerRef.current?.disconnect();

    let scheduled = 0;
    const mo = new MutationObserver(() => {
      window.clearTimeout(scheduled);
      scheduled = window.setTimeout(() => applyPanelI18n(localeRef.current), 50);
    });
    mo.observe(doc.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    observerRef.current = mo;
  }

  useEffect(() => {
    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
    };
  }, []);

  return (
    <div className="csrx-stage">
      <div className="csrx-frame-wrap">
        {!blocked ? (
          <>
            <iframe
              key={key}
              ref={iframeRef}
              className="csrx-frame"
              title="Terrain LiDAR tool"
              src={EMBED_SRC}
              referrerPolicy="no-referrer-when-downgrade"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"
              onLoad={onFrameLoad}
              onError={() => setBlocked(true)}
            />

            <div className="csrx-brand-cover" aria-hidden>
              <div className="csrx-brand-cover-inner">
                <span className="csrx-brand-cover-mark">AquaSentinel</span>
                <span className="csrx-brand-cover-tag">{t('csrx.tag')}</span>
              </div>
            </div>

            <div className="csrx-dock" role="toolbar" aria-label={t('csrx.controls')}>
              <button
                type="button"
                className="csrx-dock-btn"
                onClick={reload}
                title={t('csrx.reload')}
              >
                <RefreshCw size={15} strokeWidth={2} aria-hidden />
                <span>{t('csrx.reload')}</span>
              </button>
              <a
                className="csrx-dock-btn csrx-dock-btn-primary"
                href={CUTSHEETRX_URL}
                target="_blank"
                rel="noopener noreferrer"
                title={t('csrx.open')}
              >
                <ExternalLink size={15} strokeWidth={2} aria-hidden />
                <span>{t('csrx.open')}</span>
              </a>
            </div>
          </>
        ) : (
          <div className="csrx-fallback">
            <p className="empty-title">{t('csrx.fallbackTitle')}</p>
            <p>{t('csrx.fallbackBody')}</p>
            <div className="csrx-fallback-actions">
              <a
                className="primary inline"
                href={CUTSHEETRX_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('csrx.openTab')}
              </a>
              <button type="button" className="ghost" onClick={reload}>
                {t('csrx.tryAgain')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
