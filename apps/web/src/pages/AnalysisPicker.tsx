import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, type Site } from '../api';
import SiteMiniMap from '../components/SiteMiniMap';

type SiteCard = Site & {
  scanCount?: number;
  latestDate?: string;
  latestNdvi?: number | null;
};

export default function AnalysisPicker() {
  const navigate = useNavigate();
  const [sites, setSites] = useState<SiteCard[]>([]);
  const [status, setStatus] = useState('Loading sites…');
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
          enriched.length
            ? 'Select a site to run or review analysis.'
            : 'No sites yet — create one on the Sites page.',
        );
      } catch (err) {
        if (!cancelled) {
          setStatus(err instanceof Error ? err.message : 'Failed to load sites');
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="picker-page">
      <header className="picker-hero">
        <p className="eyebrow">Analysis</p>
        <h1>Select a site</h1>
        <p className="sub">{status}</p>
      </header>

      {busy ? (
        <div className="picker-loading">Loading your fields…</div>
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
                  <span className="site-card-cta">Open →</span>
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
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
