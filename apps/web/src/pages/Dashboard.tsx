import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, type Site, type WeatherDay } from '../api';
import SiteMiniMap from '../components/SiteMiniMap';

type SiteCard = Site & {
  scanCount?: number;
  latestDate?: string;
  latestNdvi?: number | null;
  weatherDay?: WeatherDay | null;
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [sites, setSites] = useState<SiteCard[]>([]);
  const [status, setStatus] = useState('Loading overview…');
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setBusy(true);
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
            ? `${enriched.length} site${enriched.length === 1 ? '' : 's'} ready`
            : 'No sites yet — draw one on Sites.',
        );
      } catch (err) {
        if (!cancelled) {
          setStatus(err instanceof Error ? err.message : 'Failed to load');
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const totalScans = sites.reduce((n, s) => n + (s.scanCount || 0), 0);

  return (
    <div className="dash-page">
      <header className="dash-hero">
        <p className="eyebrow">Dashboard</p>
        <h1>Field overview</h1>
        <p className="sub">{status}</p>
      </header>

      <div className="dash-stats">
        <div className="dash-stat">
          <strong>{busy ? '—' : sites.length}</strong>
          <span>Sites</span>
        </div>
        <div className="dash-stat">
          <strong>{busy ? '—' : totalScans}</strong>
          <span>Scans</span>
        </div>
        <div className="dash-actions">
          <Link className="primary inline" to="/sites">
            Manage sites
          </Link>
          <Link className="ghost inline" to="/analysis">
            Open analysis
          </Link>
          <button
            className="ghost"
            type="button"
            onClick={async () => {
              try {
                const demo = (await fetch('/demo.json').then((r) =>
                  r.json(),
                )) as { siteId: string };
                navigate(`/analysis/${demo.siteId}`);
              } catch {
                setStatus('Demo cache missing.');
              }
            }}
          >
            Load demo
          </button>
        </div>
      </div>

      {busy ? (
        <div className="picker-loading">Loading fields…</div>
      ) : sites.length === 0 ? (
        <div className="picker-empty">
          <p>No sites saved yet.</p>
          <Link className="primary inline" to="/sites">
            Go to Sites
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
                  <span className="site-card-cta">Analyse →</span>
                </div>
                <div className="site-card-meta">
                  <span>
                    {s.scanCount
                      ? `${s.scanCount} scan${s.scanCount === 1 ? '' : 's'}`
                      : 'No scans yet'}
                  </span>
                  {s.latestDate && (
                    <span>
                      Latest {s.latestDate}
                      {s.latestNdvi != null
                        ? ` · NDVI ${s.latestNdvi.toFixed(3)}`
                        : ''}
                    </span>
                  )}
                  {s.weatherDay && (
                    <span>
                      Rain{' '}
                      {s.weatherDay.precipMm != null
                        ? `${s.weatherDay.precipMm.toFixed(1)} mm`
                        : '—'}
                      {s.weatherDay.tempMeanC != null
                        ? ` · ${s.weatherDay.tempMeanC.toFixed(1)}°C`
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
