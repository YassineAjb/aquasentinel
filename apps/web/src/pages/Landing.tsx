import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useLanguage } from '../i18n';

type LiveStats = {
  sites: number;
  scans: number;
  latestNdvi: number | null;
  latestDate: string | null;
};

const DEMO = {
  sensor: 'Sentinel-2 L2A',
  resolution: '10 m',
  dates: ['2026-11-08', '2026-11-13', '2026-11-15'],
  ndviBefore: 0.223,
  ndviAfter: 0.205,
  delta: -0.018,
  cloudBefore: 9.8,
  cloudAfter: 0.2,
};

export default function Landing() {
  const { t } = useLanguage();
  const [live, setLive] = useState<LiveStats>({
    sites: 0,
    scans: 0,
    latestNdvi: null,
    latestDate: null,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sites = await api.listSites();
        const obsLists = await Promise.all(
          sites.map((s) => api.listObservations(s._id).catch(() => [])),
        );
        if (cancelled) return;
        const flat = obsLists.flat();
        const latest = flat
          .slice()
          .sort((a, b) =>
            (a.acquiredAt || '') < (b.acquiredAt || '') ? 1 : -1,
          )[0];
        setLive({
          sites: sites.length,
          scans: flat.length,
          latestNdvi: latest?.stats?.mean ?? null,
          latestDate: latest?.acquiredAt ?? null,
        });
      } catch {
        /* keep zeros — landing still works offline */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="landing-page">
      <section className="landing-hero">
        <div className="landing-hero-media" aria-hidden />
        <div className="landing-hero-veil" aria-hidden />
        <div className="landing-stage">
          <p className="landing-brand">AquaSentinel</p>
          <h1>{t('landing.headline')}</h1>
          <p className="landing-lead">{t('landing.lead')}</p>
          <div className="landing-cta">
            <Link className="primary inline" to="/dashboard">
              {t('landing.openDashboard')}
            </Link>
            <Link className="ghost inline" to="/analysis">
              {t('landing.runAnalysis')}
            </Link>
          </div>
        </div>
      </section>

      <section className="landing-section landing-data">
        <header className="landing-section-head">
          <p className="eyebrow">{t('landing.liveEyebrow')}</p>
          <h2>{t('landing.liveTitle')}</h2>
          <p className="sub">{t('landing.liveSub')}</p>
        </header>

        <div className="landing-metrics">
          <div className="landing-metric">
            <strong>{live.sites}</strong>
            <span>{t('landing.savedSites')}</span>
          </div>
          <div className="landing-metric">
            <strong>{live.scans}</strong>
            <span>{t('landing.storedScans')}</span>
          </div>
          <div className="landing-metric">
            <strong>
              {live.latestNdvi != null ? live.latestNdvi.toFixed(3) : '—'}
            </strong>
            <span>
              {t('landing.latestNdvi')}
              {live.latestDate ? ` · ${live.latestDate}` : ''}
            </span>
          </div>
          <div className="landing-metric">
            <strong>10 m</strong>
            <span>{t('landing.resolution')}</span>
          </div>
        </div>
      </section>

      <section className="landing-section landing-compare">
        <header className="landing-section-head">
          <p className="eyebrow">{t('landing.demoEyebrow')}</p>
          <h2>{t('landing.demoTitle')}</h2>
          <p className="sub">
            {t('landing.demoSub', {
              sensor: DEMO.sensor,
              cloudBefore: DEMO.cloudBefore,
              cloudAfter: DEMO.cloudAfter,
              delta: DEMO.delta.toFixed(3),
            })}
          </p>
        </header>

        <div className="landing-pair">
          <figure className="landing-frame">
            <img
              src="/landing/ndvi-older.png"
              alt={`NDVI ${DEMO.dates[0]}`}
            />
            <figcaption>
              <span>{DEMO.dates[0]}</span>
              <strong>NDVI {DEMO.ndviBefore.toFixed(3)}</strong>
            </figcaption>
          </figure>
          <figure className="landing-frame">
            <img
              src="/landing/ndvi-latest.png"
              alt={`NDVI ${DEMO.dates[2]}`}
            />
            <figcaption>
              <span>{DEMO.dates[2]}</span>
              <strong>NDVI {DEMO.ndviAfter.toFixed(3)}</strong>
            </figcaption>
          </figure>
        </div>

        <div className="landing-facts">
          <p>
            <strong>{t('landing.pipeline')}</strong> {t('landing.pipelineText')}
          </p>
          <p>
            <strong>{t('landing.honesty')}</strong> {t('landing.honestyText')}
          </p>
        </div>

        <div className="landing-cta">
          <Link className="primary inline" to="/sites">
            {t('landing.drawSite')}
          </Link>
          <Link className="ghost inline" to="/dashboard">
            {t('landing.loadDemo')}
          </Link>
        </div>
      </section>
    </div>
  );
}
