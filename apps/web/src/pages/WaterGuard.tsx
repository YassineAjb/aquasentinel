import { useCallback, useEffect, useMemo, useState } from 'react';
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
import './WaterGuard.css';


const STATUS_LABEL: Record<string, string> = { NORMAL: 'Normal', WARNING: 'Anomaly detected', LEAK: 'Leak suspected', OFF: 'Stopped' };
function fmt(value: number) { return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 1 }); }

export default function WaterGuard() {
  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState('');
  const [live, setLive] = useState<WaterGuardLive | null>(null);
  const [history, setHistory] = useState<WaterMeasurement[]>([]);
  const [alerts, setAlerts] = useState<WaterAlert[]>([]);
  const [expectedFlow, setExpectedFlow] = useState(18);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Choose a field to begin.');

  useEffect(() => { api.listSites().then((list) => { setSites(list); if (list[0]) setSiteId(list[0]._id); }).catch((e) => setMessage(e.message)); }, []);

  const refresh = useCallback(async (id: string) => {
    if (!id) return;
    const [current, rows, alertRows] = await Promise.all([waterguardApi.live(id), waterguardApi.history(id), waterguardApi.alerts(id)]);
    setLive(current); setHistory(rows.reverse()); setAlerts(alertRows);
  }, []);

  useEffect(() => { if (siteId) refresh(siteId).catch((e) => setMessage(e.message)); }, [siteId, refresh]);
  useEffect(() => {
    if (!siteId || !live?.active) return;
    const timer = window.setInterval(() => refresh(siteId).catch(() => undefined), 2500);
    return () => window.clearInterval(timer);
  }, [siteId, live?.active, refresh]);

  const activeAlerts = alerts.filter((a) => a.status === 'ACTIVE');
  const chartPoints = useMemo(() => history.slice(-40), [history]);
  const maxFlow = Math.max(expectedFlow * 2, ...chartPoints.map((p) => p.flowRate), 1);
  const points = chartPoints.map((p, i) => `${chartPoints.length < 2 ? 50 : 20 + i * (760 / (chartPoints.length - 1))},${220 - (p.flowRate / maxFlow) * 190}`).join(' ');
  const expectedY = 220 - (expectedFlow / maxFlow) * 190;

  async function perform(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try { await action(); await refresh(siteId); setMessage(success); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Action failed'); }
    finally { setBusy(false); }
  }

  async function resolve(alertId: string) {
    setBusy(true);
    try { await waterguardApi.resolveAlert(alertId); await refresh(siteId); setMessage('Alert marked as resolved.'); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Unable to resolve alert'); }
    finally { setBusy(false); }
  }

  return <main className="wg-page">
    <header className="wg-header">
      <div><p className="wg-eyebrow">AquaSentinel · Smart Water Management</p><h1>WaterGuard</h1><p className="wg-sub">Monitor irrigation flow and detect water loss before it becomes costly.</p></div>
      <div className="wg-field-select"><label htmlFor="wg-site">Agricultural field</label><select id="wg-site" value={siteId} onChange={(e) => setSiteId(e.target.value)}>{sites.map((site) => <option key={site._id} value={site._id}>{site.name}</option>)}</select></div>
    </header>

    {!sites.length ? <section className="wg-empty"><Droplets size={32}/><h2>No field available</h2><p>Create a site in AquaSentinel Sites before using WaterGuard.</p></section> : <>
      <div className={`wg-status-banner ${live?.status?.toLowerCase() || 'off'}`}><span className="wg-status-dot"/><div><strong>{STATUS_LABEL[live?.status || 'OFF']}</strong><p>{live?.active ? 'Irrigation session is running · simulated sensor data' : 'No active session. Start a simulation to monitor water flow.'}</p></div><span className="wg-sim-badge">SIMULATED DATA</span></div>
      <section className="wg-kpis">
        <article className="wg-kpi"><div className="wg-kpi-label"><Gauge size={17}/> Current flow</div><strong>{fmt(live?.flowRate || 0)} <small>L/min</small></strong><span>Expected {fmt(live?.expectedFlow ?? expectedFlow)} L/min</span></article>
        <article className="wg-kpi"><div className="wg-kpi-label"><Droplets size={17}/> Volume used</div><strong>{fmt(live?.totalVolumeLiters || 0)} <small>L</small></strong><span>Accumulated this session</span></article>
        <article className="wg-kpi"><div className="wg-kpi-label"><Waves size={17}/> Estimated excess</div><strong>{fmt(live?.estimatedLossLiters || 0)} <small>L</small></strong><span>Flow above expected rate during leak scenario</span></article>
        <article className="wg-kpi"><div className="wg-kpi-label"><AlertTriangle size={17}/> Active alerts</div><strong>{activeAlerts.length}</strong><span>{activeAlerts.filter((a) => a.severity === 'HIGH').length} high severity</span></article>
      </section>
      <div className="wg-main-grid">
        <section className="wg-panel wg-chart-panel"><div className="wg-panel-head"><div><h2><Activity size={18}/> Flow monitoring</h2><p>Actual flow compared with expected baseline</p></div><span className="wg-legend"><i/> Measured</span></div>
          <div className="wg-chart-wrap"><svg viewBox="0 0 800 245" role="img" aria-label="Water flow trend chart"><line x1="20" y1={expectedY} x2="780" y2={expectedY} stroke="#e0b05a" strokeDasharray="6 6" strokeWidth="1.5"/><text x="26" y={Math.max(15, expectedY - 7)} fill="#dcb05e" fontSize="11">Expected {expectedFlow} L/min</text>{[0,0.25,0.5,0.75,1].map((n) => <line key={n} x1="20" y1={220-n*190} x2="780" y2={220-n*190} stroke="rgba(160,180,165,.10)"/>)}{points && <polyline points={points} fill="none" stroke="#65c88a" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round"/>}{chartPoints.map((p,i) => chartPoints.length < 40 && <circle key={p._id || i} cx={chartPoints.length < 2 ? 50 : 20+i*(760/(chartPoints.length-1))} cy={220-(p.flowRate/maxFlow)*190} r="3" fill="#65c88a"/> )}</svg><div className="wg-chart-labels"><span>Oldest</span><span>Latest reading</span></div></div>
          <div className="wg-chart-footer"><span><b>{history.length}</b> readings saved</span><span>Expected flow <b>{fmt(expectedFlow)} L/min</b></span></div>
        </section>
        <section className="wg-panel wg-controls"><div className="wg-panel-head"><div><h2><Play size={18}/> Simulation controls</h2><p>Start a session, then inject a leak scenario</p></div></div><label className="wg-label">Expected flow rate (L/min)</label><input type="number" min="1" max="5000" value={expectedFlow} onChange={(e) => setExpectedFlow(Number(e.target.value))} disabled={live?.active}/><div className="wg-control-buttons"><button disabled={busy || live?.active || !siteId} onClick={() => perform(() => waterguardApi.start(siteId, expectedFlow), 'Irrigation simulation started.')} className="wg-btn wg-primary"><Play size={16}/> Start session</button><button disabled={busy || !live?.active} onClick={() => perform(() => waterguardApi.stop(siteId), 'Session stopped.')} className="wg-btn wg-stop"><Square size={16}/> Stop</button></div><div className="wg-scenario-label">Inject scenario</div><div className="wg-scenario-buttons"><button disabled={busy || !live?.active} onClick={() => perform(() => waterguardApi.simulate(siteId, 'NORMAL'), 'Normal flow measurement recorded.')} className="wg-btn wg-normal"><CheckCircle2 size={16}/> Normal</button><button disabled={busy || !live?.active} onClick={() => perform(() => waterguardApi.simulate(siteId, 'SLOW_LEAK'), 'Slow leak measurement recorded.')} className="wg-btn wg-warning"><AlertTriangle size={16}/> Slow leak</button><button disabled={busy || !live?.active} onClick={() => perform(() => waterguardApi.simulate(siteId, 'MAJOR_LEAK'), 'Major leak measurement recorded.')} className="wg-btn wg-danger"><AlertTriangle size={16}/> Major leak</button><button disabled={busy || !live?.active} onClick={() => perform(() => waterguardApi.simulate(siteId, 'OFF'), 'Flow stopped scenario recorded.')} className="wg-btn wg-off"><Square size={16}/> Irrigation off</button></div><div className="wg-message">{busy ? 'Updating…' : message}</div><p className="wg-footnote">Each scenario button records a measurement and advances the simulation by approximately one minute.</p></section>
      </div>
      <section className="wg-panel wg-alert-panel"><div className="wg-panel-head"><div><h2><AlertTriangle size={18}/> Alerts & recommendations</h2><p>WaterGuard flags sustained high flow. Review and resolve alerts after inspection.</p></div><span className="wg-alert-count">{activeAlerts.length} active</span></div>{alerts.length === 0 ? <div className="wg-no-alert"><CheckCircle2 size={20}/><span>No alerts yet. Run a leak scenario to see detection in action.</span></div> : <div className="wg-alert-list">{alerts.slice(0,8).map((alert) => <article className={`wg-alert ${alert.severity.toLowerCase()}`} key={alert._id}><div className="wg-alert-icon"><AlertTriangle size={19}/></div><div className="wg-alert-body"><div className="wg-alert-title"><strong>{alert.severity === 'HIGH' ? 'Leak suspected' : 'Abnormal flow detected'}</strong><span>{alert.status}</span></div><p>{alert.explanation}</p><div className="wg-alert-meta">Expected {fmt(alert.expectedFlow)} · Measured {fmt(alert.measuredFlow)} L/min · +{alert.excessPercentage}%</div>{alert.status === 'ACTIVE' && <button disabled={busy} className="wg-resolve" onClick={() => resolve(alert._id)}>Mark resolved</button>}</div></article>)}</div>}</section>
    </>}
  </main>;
}
