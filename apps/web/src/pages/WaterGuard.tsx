import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Droplets,
  Gauge,
  Play,
  Square,
  Waves,
} from 'lucide-react';
import {
  api,
  waterguardApi,
  type Site,
  type WaterAlert,
  type WaterGuardLive,
  type WaterMeasurement,
} from '../api';
import SiteMiniMap from '../components/SiteMiniMap';
import { useConfirm } from '../confirm';
import { useLanguage } from '../i18n';
import './WaterGuard.css';

function fmt(value: number) {
  return Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits: 1,
  });
}

const DEMO_STEPS: Array<'NORMAL' | 'SLOW_LEAK' | 'MAJOR_LEAK' | 'OFF'> = [
  'NORMAL',
  'NORMAL',
  'SLOW_LEAK',
  'SLOW_LEAK',
  'SLOW_LEAK',
  'MAJOR_LEAK',
  'MAJOR_LEAK',
  'MAJOR_LEAK',
];

const DEMO_MS = 8000;
const STEP_MS = DEMO_MS / DEMO_STEPS.length;

export default function WaterGuard() {
  const { t } = useLanguage();
  const { confirm } = useConfirm();
  const STATUS_LABEL: Record<string, string> = {
    NORMAL: t('wg.status.NORMAL'),
    WARNING: t('wg.status.WARNING'),
    LEAK: t('wg.status.LEAK'),
    OFF: t('wg.status.OFF'),
  };
  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState('');
  const [live, setLive] = useState<WaterGuardLive | null>(null);
  const [history, setHistory] = useState<WaterMeasurement[]>([]);
  const [alerts, setAlerts] = useState<WaterAlert[]>([]);
  const [expectedFlow] = useState(18);
  const [busy, setBusy] = useState(false);
  const [demoRunning, setDemoRunning] = useState(false);
  const [message, setMessage] = useState('');
  const demoGen = useRef(0);

  useEffect(() => {
    setMessage(t('wg.choose'));
  }, [t]);

  useEffect(() => {
    api
      .listSites()
      .then((list) => {
        setSites(list);
        if (list[0]) setSiteId(list[0]._id);
      })
      .catch((e) => setMessage(e.message));
  }, []);

  const refresh = useCallback(async (id: string) => {
    if (!id) return;
    const [current, rows, alertRows] = await Promise.all([
      waterguardApi.live(id),
      waterguardApi.history(id),
      waterguardApi.alerts(id),
    ]);
    setLive(current);
    setHistory(rows.reverse());
    setAlerts(alertRows);
  }, []);

  useEffect(() => {
    if (siteId) refresh(siteId).catch((e) => setMessage(e.message));
  }, [siteId, refresh]);

  useEffect(() => {
    if (!siteId || !live?.active || demoRunning) return;
    const timer = window.setInterval(
      () => refresh(siteId).catch(() => undefined),
      2500,
    );
    return () => window.clearInterval(timer);
  }, [siteId, live?.active, demoRunning, refresh]);

  useEffect(() => {
    return () => {
      demoGen.current += 1;
    };
  }, []);

  const activeAlerts = alerts.filter((a) => a.status === 'ACTIVE');
  const chartPoints = useMemo(() => history.slice(-40), [history]);
  const maxFlow = Math.max(
    expectedFlow * 2,
    ...chartPoints.map((p) => p.flowRate),
    1,
  );
  const points = chartPoints
    .map(
      (p, i) =>
        `${chartPoints.length < 2 ? 50 : 20 + i * (760 / (chartPoints.length - 1))},${220 - (p.flowRate / maxFlow) * 190}`,
    )
    .join(' ');
  const expectedY = 220 - (expectedFlow / maxFlow) * 190;

  async function runDemo(id: string, gen: number) {
    for (let i = 0; i < DEMO_STEPS.length; i++) {
      if (demoGen.current !== gen) return;
      await waterguardApi.simulate(id, DEMO_STEPS[i]);
      await refresh(id);
      if (i < DEMO_STEPS.length - 1) {
        await new Promise((r) => window.setTimeout(r, STEP_MS));
      }
    }
  }

  async function startSession() {
    if (!siteId || busy || demoRunning) return;
    setBusy(true);
    setDemoRunning(true);
    const gen = ++demoGen.current;
    try {
      await waterguardApi.start(siteId, expectedFlow);
      await refresh(siteId);
      setMessage('Monitoring started — reading flow…');
      setBusy(false);
      await runDemo(siteId, gen);
      if (demoGen.current === gen) {
        setMessage('Monitoring complete. Review any alerts below.');
        confirm(t('confirm.monitorDone'));
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('wg.failed'));
      confirm(t('confirm.failed'), 'error');
    } finally {
      if (demoGen.current === gen) setDemoRunning(false);
      setBusy(false);
    }
  }

  async function stopSession() {
    if (!siteId) return;
    demoGen.current += 1;
    setDemoRunning(false);
    setBusy(true);
    try {
      await waterguardApi.stop(siteId);
      await refresh(siteId);
      setMessage('Session stopped.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('wg.failed'));
    } finally {
      setBusy(false);
    }
  }

  async function resolve(alertId: string) {
    setBusy(true);
    try {
      await waterguardApi.resolveAlert(alertId);
      await refresh(siteId);
      setMessage('Alert marked as resolved.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Unable to resolve alert');
    } finally {
      setBusy(false);
    }
  }

  const sessionLive = !!live?.active;
  const selectedSite = sites.find((s) => s._id === siteId) ?? null;

  return (
    <main className="wg-page">
      <div className="dash-bg" aria-hidden />
      <div className="wg-scroll">
      <header className="wg-header">
        <div>
          <p className="wg-eyebrow">SAKIYA · Smart Water Management</p>
          <h1>WaterGuard</h1>
          <p className="wg-sub">
            Monitor irrigation flow and detect water loss before it becomes
            costly.
          </p>
        </div>
        <div className="wg-field-select">
          <label htmlFor="wg-site">Agricultural field</label>
          <div className="wg-field-card">
            <div className="wg-field-map" aria-hidden>
              {selectedSite?.boundary ? (
                <SiteMiniMap
                  key={selectedSite._id}
                  boundary={selectedSite.boundary}
                  className="wg-field-mini-map"
                />
              ) : (
                <div className="wg-field-map-empty">No map</div>
              )}
            </div>
            <div className="wg-field-meta">
              <strong className="wg-field-name">
                {selectedSite?.name || 'Select a field'}
              </strong>
              <select
                id="wg-site"
                value={siteId}
                disabled={busy || demoRunning}
                onChange={(e) => setSiteId(e.target.value)}
                aria-label="Agricultural field"
              >
                {sites.map((site) => (
                  <option key={site._id} value={site._id}>
                    {site.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </header>

      {!sites.length ? (
        <section className="wg-empty">
          <Droplets size={32} />
          <h2>No field available</h2>
          <p>Create a site in SAKIYA Sites before using WaterGuard.</p>
        </section>
      ) : (
        <>
          <div
            className={`wg-status-banner ${live?.status?.toLowerCase() || 'off'}`}
          >
            <span className="wg-status-dot" />
            <div>
              <strong>{STATUS_LABEL[live?.status || 'OFF']}</strong>
              <p>
                {demoRunning
                  ? 'Live monitoring in progress…'
                  : sessionLive
                    ? 'Irrigation session is running — monitoring flow against the expected baseline.'
                    : 'No active session. Start monitoring to watch irrigation flow.'}
              </p>
            </div>
            <div className="wg-banner-actions">
              {!sessionLive && !demoRunning ? (
                <button
                  type="button"
                  className="wg-btn wg-primary"
                  disabled={busy || !siteId}
                  onClick={() => void startSession()}
                >
                  <Play size={16} /> Start session
                </button>
              ) : (
                <button
                  type="button"
                  className="wg-btn wg-stop"
                  disabled={busy && !demoRunning}
                  onClick={() => void stopSession()}
                >
                  <Square size={16} /> Stop
                </button>
              )}
            </div>
          </div>

          {message && <div className="wg-message">{message}</div>}

          <section className="wg-kpis">
            <article className="wg-kpi">
              <div className="wg-kpi-label">
                <Gauge size={17} /> Current flow
              </div>
              <strong>
                {fmt(live?.flowRate || 0)} <small>L/min</small>
              </strong>
              <span>
                Expected {fmt(live?.expectedFlow ?? expectedFlow)} L/min
              </span>
            </article>
            <article className="wg-kpi">
              <div className="wg-kpi-label">
                <Droplets size={17} /> Volume used
              </div>
              <strong>
                {fmt(live?.totalVolumeLiters || 0)} <small>L</small>
              </strong>
              <span>Accumulated this session</span>
            </article>
            <article className="wg-kpi">
              <div className="wg-kpi-label">
                <Waves size={17} /> Estimated excess
              </div>
              <strong>
                {fmt(live?.estimatedLossLiters || 0)} <small>L</small>
              </strong>
              <span>Flow above expected rate</span>
            </article>
            <article className="wg-kpi">
              <div className="wg-kpi-label">
                <AlertTriangle size={17} /> Active alerts
              </div>
              <strong>{activeAlerts.length}</strong>
              <span>
                {
                  activeAlerts.filter((a) => a.severity === 'HIGH').length
                }{' '}
                high severity
              </span>
            </article>
          </section>

          <section className="wg-panel wg-chart-panel wg-chart-full">
            <div className="wg-panel-head">
              <div>
                <h2>
                  <Activity size={18} /> Flow monitoring
                </h2>
                <p>Actual flow compared with expected baseline</p>
              </div>
              <span className="wg-legend">
                <i /> Measured
              </span>
            </div>
            <div className="wg-chart-wrap">
              <svg
                viewBox="0 0 800 245"
                role="img"
                aria-label="Water flow trend chart"
              >
                <line
                  x1="20"
                  y1={expectedY}
                  x2="780"
                  y2={expectedY}
                  stroke="#e0b05a"
                  strokeDasharray="6 6"
                  strokeWidth="1.5"
                />
                <text
                  x="26"
                  y={Math.max(15, expectedY - 7)}
                  fill="#dcb05e"
                  fontSize="11"
                >
                  Expected {expectedFlow} L/min
                </text>
                {[0, 0.25, 0.5, 0.75, 1].map((n) => (
                  <line
                    key={n}
                    x1="20"
                    y1={220 - n * 190}
                    x2="780"
                    y2={220 - n * 190}
                    stroke="rgba(160,180,165,.10)"
                  />
                ))}
                {points && (
                  <polyline
                    points={points}
                    fill="none"
                    stroke="#65c88a"
                    strokeWidth="3"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                )}
                {chartPoints.map(
                  (p, i) =>
                    chartPoints.length < 40 && (
                      <circle
                        key={p._id || i}
                        cx={
                          chartPoints.length < 2
                            ? 50
                            : 20 + i * (760 / (chartPoints.length - 1))
                        }
                        cy={220 - (p.flowRate / maxFlow) * 190}
                        r="3"
                        fill="#65c88a"
                      />
                    ),
                )}
              </svg>
              <div className="wg-chart-labels">
                <span>Oldest</span>
                <span>Latest reading</span>
              </div>
            </div>
            <div className="wg-chart-footer">
              <span>
                <b>{history.length}</b> readings saved
              </span>
              <span>
                Expected flow <b>{fmt(expectedFlow)} L/min</b>
              </span>
            </div>
          </section>

          <section className="wg-panel wg-alert-panel">
            <div className="wg-panel-head">
              <div>
                <h2>
                  <AlertTriangle size={18} /> Alerts & recommendations
                </h2>
                <p>
                  WaterGuard flags sustained high flow. Review and resolve
                  alerts after inspection.
                </p>
              </div>
              <span className="wg-alert-count">
                {activeAlerts.length} active
              </span>
            </div>
            {alerts.length === 0 ? (
              <div className="wg-no-alert">
                <CheckCircle2 size={20} />
                <span>
                  No alerts yet. Monitoring will flag sustained high flow.
                </span>
              </div>
            ) : (
              <div className="wg-alert-list">
                {alerts.slice(0, 8).map((alert) => (
                  <article
                    className={`wg-alert ${alert.severity.toLowerCase()}`}
                    key={alert._id}
                  >
                    <div className="wg-alert-icon">
                      <AlertTriangle size={19} />
                    </div>
                    <div className="wg-alert-body">
                      <div className="wg-alert-title">
                        <strong>
                          {alert.severity === 'HIGH'
                            ? 'Leak suspected'
                            : 'Abnormal flow detected'}
                        </strong>
                        <span>{alert.status}</span>
                      </div>
                      <p>{alert.explanation}</p>
                      <div className="wg-alert-meta">
                        Expected {fmt(alert.expectedFlow)} · Measured{' '}
                        {fmt(alert.measuredFlow)} L/min · +
                        {alert.excessPercentage}%
                      </div>
                      {alert.status === 'ACTIVE' && (
                        <button
                          disabled={busy || demoRunning}
                          className="wg-resolve"
                          onClick={() => resolve(alert._id)}
                        >
                          Mark resolved
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
      </div>
    </main>
  );
}
