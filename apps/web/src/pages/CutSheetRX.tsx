import { useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';

export const CUTSHEETRX_URL = 'https://www.senterfarms.com/programs/csrx/';

export default function CutSheetRX() {
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
                <span className="csrx-brand-cover-tag">Terrain · LiDAR</span>
              </div>
            </div>

            <div className="csrx-dock" role="toolbar" aria-label="Embed controls">
              <button
                type="button"
                className="csrx-dock-btn"
                onClick={reload}
                title="Reload"
              >
                <RefreshCw size={15} strokeWidth={2} aria-hidden />
                <span>Reload</span>
              </button>
              <a
                className="csrx-dock-btn csrx-dock-btn-primary"
                href={CUTSHEETRX_URL}
                target="_blank"
                rel="noopener noreferrer"
                title="Open in new tab"
              >
                <ExternalLink size={15} strokeWidth={2} aria-hidden />
                <span>Open</span>
              </a>
            </div>
          </>
        ) : (
          <div className="csrx-fallback">
            <p className="empty-title">Couldn’t load the embed</p>
            <p>The host may block framing. Open the tool in a new tab instead.</p>
            <div className="csrx-fallback-actions">
              <a
                className="primary inline"
                href={CUTSHEETRX_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open in new tab
              </a>
              <button type="button" className="ghost" onClick={reload}>
                Try again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
