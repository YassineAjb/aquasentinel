import { useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { useLanguage } from '../i18n';

export const CUTSHEETRX_URL = 'https://www.senterfarms.com/programs/csrx/';

export default function CutSheetRX() {
  const { t } = useLanguage();
  const [key, setKey] = useState(0);
  const [blocked, setBlocked] = useState(false);

  function reload() {
    setBlocked(false);
    setKey((k) => k + 1);
  }

  return (
    <div className="csrx-stage">
      <div className="csrx-frame-wrap">
        {!blocked ? (
          <>
            <iframe
              key={key}
              className="csrx-frame"
              title="Terrain LiDAR tool"
              src={CUTSHEETRX_URL}
              referrerPolicy="no-referrer-when-downgrade"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"
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
