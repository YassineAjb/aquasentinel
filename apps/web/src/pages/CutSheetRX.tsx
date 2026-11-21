import { useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';

export const CUTSHEETRX_URL = 'https://www.senterfarms.com/programs/csrx/';

export default function CutSheetRX() {
  const [key, setKey] = useState(0);
  const [blocked, setBlocked] = useState(false);

  return (
    <div className="csrx-stage">
      <header className="csrx-bar">
        <div className="csrx-bar-copy">
          <p className="eyebrow">External tool</p>
          <h1>CutSheetRX</h1>
          <p className="csrx-bar-sub">
            USGS LiDAR drainage &amp; terrain analysis by Travis Senter / Senter Farms —
            embedded here for reference. Not part of AquaSentinel’s simulated RainCatch.
          </p>
        </div>
        <div className="csrx-bar-actions">
          <button
            type="button"
            className="ghost compact"
            onClick={() => {
              setBlocked(false);
              setKey((k) => k + 1);
            }}
            title="Reload"
          >
            <RefreshCw size={14} strokeWidth={2} aria-hidden />
            Reload
          </button>
          <a
            className="primary inline compact"
            href={CUTSHEETRX_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink size={14} strokeWidth={2} aria-hidden />
            Open in new tab
          </a>
        </div>
      </header>

      <div className="csrx-frame-wrap">
        {!blocked ? (
          <>
            <iframe
              key={key}
              className="csrx-frame"
              title="CutSheetRX — Senter Farms"
              src={CUTSHEETRX_URL}
              referrerPolicy="no-referrer-when-downgrade"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"
              onError={() => setBlocked(true)}
            />
            <p className="csrx-frame-note">
              If this area stays blank, the host blocks embedding — use{' '}
              <button type="button" className="csrx-text-btn" onClick={() => setBlocked(true)}>
                open in new tab
              </button>
              .
            </p>
          </>
        ) : (
          <div className="csrx-fallback">
            <p className="empty-title">Open CutSheetRX externally</p>
            <p>
              Embedding may be blocked by the site. Continue in a new browser tab.
            </p>
            <a
              className="primary inline"
              href={CUTSHEETRX_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open CutSheetRX
            </a>
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setBlocked(false);
                setKey((k) => k + 1);
              }}
            >
              Try embed again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
