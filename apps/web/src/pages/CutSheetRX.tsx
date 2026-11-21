import { useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';

export const CUTSHEETRX_URL = 'https://www.senterfarms.com/programs/csrx/';

export default function CutSheetRX() {
  const [key, setKey] = useState(0);
  const [blocked, setBlocked] = useState(false);

  return (
    <div className="csrx-stage">
      <header className="csrx-bar csrx-bar-slim">
        <p className="csrx-bar-sub">
          External USGS LiDAR terrain tool (embedded). Separate from AquaSentinel RainCatch.
        </p>
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
              title="External LiDAR terrain tool"
              src={CUTSHEETRX_URL}
              referrerPolicy="no-referrer-when-downgrade"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"
              onError={() => setBlocked(true)}
            />
            {/* Replaces host logo/title with a seamless panel header (same chrome as their sidebar). */}
            <div className="csrx-brand-cover" aria-hidden>
              <span className="csrx-brand-cover-mark">AquaSentinel</span>
              <span className="csrx-brand-cover-tag">Terrain · LiDAR</span>
            </div>
            <p className="csrx-frame-note">
              Blank frame?{' '}
              <button type="button" className="csrx-text-btn" onClick={() => setBlocked(true)}>
                Open in new tab
              </button>
            </p>
          </>
        ) : (
          <div className="csrx-fallback">
            <p className="empty-title">Open external tool</p>
            <p>
              Embedding may be blocked by the site. Continue in a new browser tab.
            </p>
            <a
              className="primary inline"
              href={CUTSHEETRX_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open in new tab
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
