import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ChartSpline,
  Droplets,
  MapPinned,
  Mountain,
  ShieldAlert,
  Sprout,
} from 'lucide-react';
import { api } from '../api';
import { useLanguage } from '../i18n';

type Overview = {
  siteCount: number;
  scanCount: number;
  latestDate?: string;
  latestNdvi?: number | null;
  latestSiteName?: string;
  incompleteProfiles: number;
};

export default function Dashboard() {
  const { t } = useLanguage();
  const [overview, setOverview] = useState<Overview>({
    siteCount: 0,
    scanCount: 0,
    incompleteProfiles: 0,
  });
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setBusy(true);
        setStatus(t('dash.loading'));
        const list = await api.listSites();
        let scanCount = 0;
        let latestDate: string | undefined;
        let latestNdvi: number | null | undefined;
        let latestSiteName: string | undefined;
        let incompleteProfiles = 0;

        for (const s of list) {
          if (!s.plantType || !s.plantAge || !s.soilType) {
            incompleteProfiles += 1;
          }
          try {
            const obs = await api.listObservations(s._id);
            scanCount += obs.length;
            const latest = obs[0];
            if (
              latest?.acquiredAt &&
              (!latestDate || latest.acquiredAt > latestDate)
            ) {
              latestDate = latest.acquiredAt;
              latestNdvi = latest.stats?.mean ?? null;
              latestSiteName = s.name;
            }
          } catch {
            /* ignore per-site scan errors */
          }
        }

        if (cancelled) return;
        setOverview({
          siteCount: list.length,
          scanCount,
          latestDate,
          latestNdvi,
          latestSiteName,
          incompleteProfiles,
        });
        setStatus(
          list.length
            ? t('dash.sitesReady', { count: list.length })
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

  return (
    <div className="dash-page">
      <div className="dash-bg" aria-hidden />
      <div className="dash-scroll">
        <header className="dash-hero">
          <h1>{t('dash.title')}</h1>
          <p className="sub">{status}</p>
        </header>

        <div className="dash-stats">
          <div className="dash-stat">
            <strong>{busy ? '—' : overview.siteCount}</strong>
            <span>{t('dash.sites')}</span>
          </div>
          <div className="dash-stat">
            <strong>{busy ? '—' : overview.scanCount}</strong>
            <span>{t('dash.scans')}</span>
          </div>
          <div className="dash-stat">
            <strong>
              {busy
                ? '—'
                : overview.latestNdvi != null
                  ? overview.latestNdvi.toFixed(2)
                  : '—'}
            </strong>
            <span>{t('dash.latestGreenness')}</span>
          </div>
        </div>

        <section className="dash-panel">
          <div className="dash-panel-head">
            <h2>{t('dash.nextTitle')}</h2>
            <p>{t('dash.nextSub')}</p>
          </div>
          <div className="dash-next-grid">
            <Link className="dash-next-card dash-next-leaf" to="/sites">
              <span className="dash-next-icon">
                <MapPinned size={22} strokeWidth={2} aria-hidden />
              </span>
              <strong>{t('dash.action.sites')}</strong>
              <span>{t('dash.action.sitesHint')}</span>
            </Link>
            <Link className="dash-next-card dash-next-field" to="/analysis">
              <span className="dash-next-icon">
                <ChartSpline size={22} strokeWidth={2} aria-hidden />
              </span>
              <strong>{t('dash.action.analysis')}</strong>
              <span>{t('dash.action.analysisHint')}</span>
            </Link>
            <Link className="dash-next-card dash-next-aqua" to="/waterguard">
              <span className="dash-next-icon">
                <ShieldAlert size={22} strokeWidth={2} aria-hidden />
              </span>
              <strong>{t('dash.action.water')}</strong>
              <span>{t('dash.action.waterHint')}</span>
            </Link>
            <Link className="dash-next-card dash-next-sakura" to="/cutsheetrx">
              <span className="dash-next-icon">
                <Mountain size={22} strokeWidth={2} aria-hidden />
              </span>
              <strong>{t('dash.action.terrain')}</strong>
              <span>{t('dash.action.terrainHint')}</span>
            </Link>
          </div>
        </section>

        <section className="dash-panel dash-glance">
          <div className="dash-panel-head">
            <h2>
              <Sprout size={16} strokeWidth={2} aria-hidden />
              {t('dash.glanceTitle')}
            </h2>
            <p>{t('dash.glanceSub')}</p>
          </div>

          {busy ? (
            <div className="picker-loading">{t('dash.loadingFields')}</div>
          ) : overview.siteCount === 0 ? (
            <div className="dash-glance-empty">
              <p>{t('dash.noSitesYet')}</p>
              <Link className="primary inline" to="/sites">
                <MapPinned size={15} strokeWidth={2} aria-hidden />
                {t('dash.goSites')}
              </Link>
            </div>
          ) : (
            <ul className="dash-glance-list">
              <li>
                <Droplets size={16} strokeWidth={2} aria-hidden />
                <div>
                  <strong>{t('dash.glance.latestScan')}</strong>
                  <span>
                    {overview.latestDate
                      ? t('dash.glance.latestScanValue', {
                          date: overview.latestDate,
                          site: overview.latestSiteName || '—',
                        })
                      : t('dash.noScans')}
                  </span>
                </div>
              </li>
              <li>
                <ChartSpline size={16} strokeWidth={2} aria-hidden />
                <div>
                  <strong>{t('dash.glance.profiles')}</strong>
                  <span>
                    {overview.incompleteProfiles > 0
                      ? t('dash.glance.profilesIncomplete', {
                          count: overview.incompleteProfiles,
                        })
                      : t('dash.glance.profilesOk')}
                  </span>
                </div>
              </li>
              <li>
                <MapPinned size={16} strokeWidth={2} aria-hidden />
                <div>
                  <strong>{t('dash.glance.fields')}</strong>
                  <span>
                    {t('dash.glance.fieldsValue', {
                      count: overview.siteCount,
                      scans: overview.scanCount,
                    })}
                  </span>
                </div>
              </li>
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
