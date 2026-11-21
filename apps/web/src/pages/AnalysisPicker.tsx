import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, type Site } from '../api';
import SiteMiniMap from '../components/SiteMiniMap';
import { useLanguage } from '../i18n';

type SiteCard = Site & {
  scanCount?: number;
  latestDate?: string;
  latestNdvi?: number | null;
};

export default function AnalysisPicker() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [sites, setSites] = useState<SiteCard[]>([]);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setBusy(true);
        setStatus(t('picker.loading'));
        const list = await api.listSites();
        const enriched = await Promise.all(
          list.map(async (s) => {
            try {
              const obs = await api.listObservations(s._id);
              const latest = obs[0];
              return {
                ...s,
                scanCount: obs.length,
                latestDate: latest?.acquiredAt,
                latestNdvi: latest?.stats?.mean ?? null,
              } satisfies SiteCard;
            } catch {
              return { ...s, scanCount: 0 } satisfies SiteCard;
            }
          }),
        );
        if (cancelled) return;
        setSites(enriched);
        setStatus(
          enriched.length ? t('picker.selectHint') : t('picker.noSites'),
        );
      } catch (err) {
        if (!cancelled) {
          setStatus(err instanceof Error ? err.message : t('picker.failed'));
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  return (
    <div className="picker-page">
      <header className="picker-hero">
        <p className="eyebrow">{t('picker.eyebrow')}</p>
        <h1>{t('picker.title')}</h1>
        <p className="sub">{status}</p>
      </header>

      {busy ? (
        <div className="picker-loading">{t('picker.loadingFields')}</div>
      ) : sites.length === 0 ? (
        <div className="picker-empty">
          <p>{t('picker.noSitesYet')}</p>
          <Link className="primary inline" to="/sites">
            {t('picker.goSites')}
          </Link>
        </div>
      ) : (
        <div className="site-cards">
          {sites.map((s) => (
            <button
              key={s._id}
              type="button"
              className="site-card"
              onClick={() => navigate(`/analysis/${s._id}`)}
            >
              <div className="site-card-map">
                <SiteMiniMap boundary={s.boundary} />
              </div>
              <div className="site-card-body">
                <div className="site-card-top">
                  <strong>{s.name}</strong>
                  <span className="site-card-cta">{t('picker.open')}</span>
                </div>
                <div className="site-card-meta">
                  <span>
                    {s.scanCount
                      ? t('dash.scan', { count: s.scanCount })
                      : t('dash.noScans')}
                  </span>
                  {s.latestDate && (
                    <span>
                      {t('dash.latest', { date: s.latestDate })}
                      {s.latestNdvi != null
                        ? ` · NDVI ${s.latestNdvi.toFixed(3)}`
                        : ''}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
