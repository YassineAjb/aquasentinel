import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

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
          <h1>Crop stress from space — so farms waste less water and energy.</h1>
          <p className="landing-lead">
            Draw a Tunisia field, pull clear Sentinel-2 scenes, and compare NDVI
            with provenance you can defend in a pitch.
          </p>
          <div className="landing-cta">
            <Link className="primary inline" to="/dashboard">
              Open dashboard
            </Link>
            <Link className="ghost inline" to="/analysis">
              Run analysis
            </Link>
          </div>
        </div>
      </section>

      <section className="landing-section landing-data">
        <header className="landing-section-head">
          <p className="eyebrow">Live workspace</p>
          <h2>What is already on this build</h2>
          <p className="sub">
            Numbers refresh from your Mongo sites — demo cache fills the story
            when the room has no network.
          </p>
        </header>

        <div className="landing-metrics">
          <div className="landing-metric">
            <strong>{live.sites}</strong>
            <span>Saved sites</span>
          </div>
          <div className="landing-metric">
            <strong>{live.scans}</strong>
            <span>Stored scans</span>
          </div>
          <div className="landing-metric">
            <strong>
              {live.latestNdvi != null ? live.latestNdvi.toFixed(3) : '—'}
            </strong>
            <span>
              Latest mean NDVI
              {live.latestDate ? ` · ${live.latestDate}` : ''}
            </span>
          </div>
          <div className="landing-metric">
            <strong>10 m</strong>
            <span>Sentinel-2 resolution</span>
          </div>
        </div>
      </section>

      <section className="landing-section landing-compare">
        <header className="landing-section-head">
          <p className="eyebrow">Demo scene pair</p>
          <h2>Kizuna field · 8 → 15 Nov 2026</h2>
          <p className="sub">
            Pre-cached {DEMO.sensor} · cloud {DEMO.cloudBefore}% →{' '}
            {DEMO.cloudAfter}% · Δ mean NDVI {DEMO.delta.toFixed(3)} (below
            inspect threshold 0.08).
          </p>
        </header>

        <div className="landing-pair">
          <figure className="landing-frame">
            <img
              src="/landing/ndvi-older.png"
              alt="NDVI overlay for 8 November 2026"
            />
            <figcaption>
              <span>{DEMO.dates[0]}</span>
              <strong>NDVI {DEMO.ndviBefore.toFixed(3)}</strong>
            </figcaption>
          </figure>
          <figure className="landing-frame">
            <img
              src="/landing/ndvi-latest.png"
              alt="NDVI overlay for 15 November 2026"
            />
            <figcaption>
              <span>{DEMO.dates[2]}</span>
              <strong>NDVI {DEMO.ndviAfter.toFixed(3)}</strong>
            </figcaption>
          </figure>
        </div>

        <div className="landing-facts">
          <p>
            <strong>Pipeline</strong> Site boundary → cloud-filtered scene →
            NDVI stats → date compare → report
          </p>
          <p>
            <strong>Honesty</strong> Enhancement is visual only. NDVI comes from
            original bands. Inspect flags are rule-based, not a diagnosis.
          </p>
        </div>

        <div className="landing-cta">
          <Link className="primary inline" to="/sites">
            Draw a site
          </Link>
          <Link className="ghost inline" to="/dashboard">
            Load demo from dashboard
          </Link>
        </div>
      </section>
    </div>
  );
}
