import { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, type Site } from '../api';
import { translateCsrxPanel } from '../csrxPanelI18n';
import { useLanguage } from '../i18n';
import type { Locale } from '../i18n/locales';

export const CUTSHEETRX_URL = 'https://www.senterfarms.com/programs/csrx/';
const EMBED_SRC = '/csrx-embed/';
const SITE_KEY = 'aquasentinel-csrx-site';

type CsrxWindow = Window & {
  L?: {
    polygon: (
      latlngs: [number, number][],
      opts?: object,
    ) => {
      addTo: (map: object) => unknown;
    };
    latLngBounds: (latlngs: [number, number][]) => {
      getCenter: () => { lat: number; lng: number };
    };
  };
  __AQUA_CSR_MAP__?: {
    fitBounds: (b: unknown, o?: object) => void;
    setView: (c: [number, number], z: number) => void;
    invalidateSize: () => void;
    removeLayer: (layer: unknown) => void;
    getZoom: () => number;
  };
  __AQUA_SITE_LAYER__?: unknown;
};

function ringLatLngs(site: Site): [number, number][] {
  const ring = site.boundary?.coordinates?.[0] ?? [];
  return ring.map(([lng, lat]) => [lat, lng] as [number, number]);
}

function siteCenter(site: Site): { lat: number; lng: number } {
  const pts = ringLatLngs(site);
  if (!pts.length) return { lat: 36.8644, lng: 9.9736 };
  let lat = 0;
  let lng = 0;
  for (const [la, ln] of pts) {
    lat += la;
    lng += ln;
  }
  return { lat: lat / pts.length, lng: lng / pts.length };
}

function rememberView(lat: number, lng: number, z = 16) {
  try {
    localStorage.setItem(
      'cutsheetrx-view',
      JSON.stringify({ lat, lng, z }),
    );
  } catch {
    /* ignore */
  }
}

/** Pan/zoom embed map to a site and outline its boundary. */
function focusSiteOnMap(win: CsrxWindow, doc: Document, site: Site): boolean {
  const latlngs = ringLatLngs(site);
  const center = siteCenter(site);
  let moved = false;

  try {
    const map = win.__AQUA_CSR_MAP__;
    const L = win.L;
    if (map) {
      map.invalidateSize();
      if (win.__AQUA_SITE_LAYER__) {
        try {
          map.removeLayer(win.__AQUA_SITE_LAYER__);
        } catch {
          /* ignore */
        }
        win.__AQUA_SITE_LAYER__ = undefined;
      }
      if (L && latlngs.length >= 3) {
        const layer = L.polygon(latlngs, {
          color: '#2f9e44',
          weight: 2.5,
          fillColor: '#2f9e44',
          fillOpacity: 0.18,
        }).addTo(map);
        win.__AQUA_SITE_LAYER__ = layer;
        const bounds = L.latLngBounds(latlngs);
        map.fitBounds(bounds, { padding: [56, 56], maxZoom: 17 });
        rememberView(bounds.getCenter().lat, bounds.getCenter().lng, map.getZoom());
      } else {
        map.setView([center.lat, center.lng], 16);
        rememberView(center.lat, center.lng, 16);
      }
      moved = true;
    }
  } catch {
    /* fall through to search form */
  }

  // Also drive the built-in Go To box (works even if map hook is late)
  try {
    const input = doc.getElementById('q') as HTMLInputElement | null;
    const goBtn = doc.getElementById('goBtn') as HTMLButtonElement | null;
    if (input) {
      const value = `${center.lat.toFixed(6)}, ${center.lng.toFixed(6)}`;
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set;
      if (setter) setter.call(input, value);
      else input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      const form =
        (doc.getElementById('searchForm') as HTMLFormElement | null) ||
        input.closest('form');
      if (form && typeof form.requestSubmit === 'function') {
        form.requestSubmit(goBtn ?? undefined);
      } else if (form) {
        form.dispatchEvent(
          new Event('submit', { bubbles: true, cancelable: true }),
        );
      } else {
        goBtn?.click();
      }
      moved = true;
    }
  } catch {
    /* ignore */
  }

  if (!moved) {
    rememberView(center.lat, center.lng, 16);
  }
  return moved;
}

export default function CutSheetRX() {
  const { t, locale } = useLanguage();
  const [key, setKey] = useState(0);
  const [blocked, setBlocked] = useState(false);
  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState('');
  const [frameReady, setFrameReady] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const observerRef = useRef<MutationObserver | null>(null);
  const localeRef = useRef<Locale>(locale);
  const siteIdRef = useRef(siteId);
  const sitesRef = useRef(sites);
  localeRef.current = locale;
  siteIdRef.current = siteId;
  sitesRef.current = sites;

  useEffect(() => {
    let cancelled = false;
    api
      .listSites()
      .then((list) => {
        if (cancelled) return;
        setSites(list);
        let initial = '';
        try {
          initial = localStorage.getItem(SITE_KEY) || '';
        } catch {
          /* ignore */
        }
        if (initial && list.some((s) => s._id === initial)) {
          setSiteId(initial);
        } else if (list[0]) {
          setSiteId(list[0]._id);
        }
      })
      .catch(() => {
        if (!cancelled) setSites([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!siteId) return;
    try {
      localStorage.setItem(SITE_KEY, siteId);
    } catch {
      /* ignore */
    }
  }, [siteId]);

  function reload() {
    setBlocked(false);
    setFrameReady(false);
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
      /* ignore */
    }
  }

  const applySiteFocus = useCallback((id: string = siteIdRef.current) => {
    const iframe = iframeRef.current;
    const win = iframe?.contentWindow as CsrxWindow | null;
    const doc = iframe?.contentDocument;
    if (!win || !doc?.body) return false;
    const site = sitesRef.current.find((s) => s._id === id);
    if (!site) return false;
    return focusSiteOnMap(win, doc, site);
  }, []);

  function onSiteChange(nextId: string) {
    setSiteId(nextId);
    siteIdRef.current = nextId;
    const site = sitesRef.current.find((s) => s._id === nextId);
    if (site) {
      const c = siteCenter(site);
      rememberView(c.lat, c.lng, 16);
    }
    // Try immediately; retry a few times (map hook can lag behind iframe paint)
    let tries = 0;
    const tick = () => {
      tries += 1;
      if (applySiteFocus(nextId)) return;
      if (tries < 8) window.setTimeout(tick, 150);
      else reload(); // last resort: reopen embed on remembered coordinates
    };
    window.requestAnimationFrame(tick);
  }

  useEffect(() => {
    applyPanelI18n(locale);
  }, [locale, key]);

  useEffect(() => {
    if (!frameReady || !siteId) return;
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      if (applySiteFocus(siteId) || tries > 50) {
        window.clearInterval(timer);
      }
    }, 120);
    return () => window.clearInterval(timer);
  }, [frameReady, siteId, key, applySiteFocus]);

  function onFrameLoad() {
    const doc = iframeRef.current?.contentDocument;
    if (!doc?.body) return;

    setFrameReady(true);
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

    // Focus current site as soon as the frame paints
    window.setTimeout(() => applySiteFocus(siteIdRef.current), 200);
    window.setTimeout(() => applySiteFocus(siteIdRef.current), 600);
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
              {sites.length > 0 ? (
                <label className="csrx-site-select">
                  <span>{t('csrx.site')}</span>
                  <select
                    value={siteId}
                    onChange={(e) => onSiteChange(e.target.value)}
                    aria-label={t('csrx.site')}
                  >
                    {sites.map((site) => (
                      <option key={site._id} value={site._id}>
                        {site.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <Link className="csrx-dock-btn" to="/sites">
                  {t('csrx.goSites')}
                </Link>
              )}
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

            {!sites.length && (
              <div className="csrx-sites-hint">
                <p>{t('csrx.noSites')}</p>
                <Link className="primary inline" to="/sites">
                  {t('csrx.goSites')}
                </Link>
              </div>
            )}
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
