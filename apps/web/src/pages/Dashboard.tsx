import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, type Site, type WeatherDay } from '../api';
import SiteMiniMap from '../components/SiteMiniMap';
import { useLanguage } from '../i18n';

type SiteCard = Site & {
  scanCount?: number;
  latestDate?: string;
  latestNdvi?: number | null;
  weatherDay?: WeatherDay | null;
};

export default function Dashboard() {
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
        setStatus(t('dash.loading'));
        const list = await api.listSites();
        const enriched = await Promise.all(
          list.map(async (s) => {
            try {
              const obs = await api.listObservations(s._id);
              const latest = obs[0];
              let weatherDay: WeatherDay | null = null;
              if (latest?.acquiredAt) {
                try {
                  const wx = await api.getWeather(s._id, {
                    around: latest.acquiredAt,
                  });
                  weatherDay = wx.sceneDay;
                } catch {
                  weatherDay = null;
                }
              }
              return {
                ...s,
                scanCount: obs.length,
                latestDate: latest?.acquiredAt,
                latestNdvi: latest?.stats?.mean ?? null,
                weatherDay,
              } satisfies SiteCard;
            } catch {
              return { ...s, scanCount: 0 } satisfies SiteCard;
            }
          }),
        );
        if (cancelled) return;
        setSites(enriched);
        setStatus(
          enriched.length
            ? t('dash.sitesReady', { count: enriched.length })
            : t('dash.noSites'),
        );
      } catch (err) {
        if (!cancelled) {
          setStatus(err instanceof Error ? err.message : t('dash.failed'));
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const totalScans = sites.reduce((n, s) => n + (s.scanCount || 0), 0);

  return (
    <div className="dash-page">
      <header className="dash-hero">
        <h1>{t('dash.title')}</h1>
        <p className="sub">{status}</p>
      </header>

      <div className="dash-stats">
        <div className="dash-stat">
          <strong>{busy ? '—' : sites.length}</strong>
          <span>{t('dash.sites')}</span>
        </div>
        <div className="dash-stat">
          <strong>{busy ? '—' : totalScans}</strong>
          <span>{t('dash.scans')}</span>
        </div>
      </div>

      {busy ? (
        <div className="picker-loading">{t('dash.loadingFields')}</div>
      ) : sites.length === 0 ? (
        <div className="picker-empty">
          <p>{t('dash.noSitesYet')}</p>
          <Link className="primary inline" to="/sites">
            {t('dash.goSites')}
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
                  <span className="site-card-cta">{t('dash.analyse')}</span>
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
                  {s.weatherDay && (
                    <span>
                      {t('dash.rain')}{' '}
                      {s.weatherDay.precipMm != null
                        ? `${s.weatherDay.precipMm.toFixed(1)} mm`
                        : '—'}
                      {s.weatherDay.tempMeanC != null
                        ? ` · ${s.weatherDay.tempMeanC.toFixed(1)}°C`
                        : ''}
                    </span>
                  )}
                  <span>
                    {s.plantType && s.plantAge && s.soilType
                      ? `${s.plantType} · ${s.plantAge} · ${s.soilType}`
                      : t('dash.cropIncomplete')}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
