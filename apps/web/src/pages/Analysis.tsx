import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  api,
  observationImageUrl,
  type CompareResult,
  type IrrigationPlan,
  type Observation,
  type Site,
  type WeatherSeries,
} from '../api';
import FieldMap from '../components/FieldMap';

const LOW_COVERAGE = 70;
type SceneVisual = 'original' | 'enhanced';

function fmtNdvi(v?: number | null) {
  return v == null ? '—' : v.toFixed(4);
}

function fmtMm(v?: number | null) {
  return v == null ? '—' : `${v.toFixed(1)} mm`;
}

function fmtC(v?: number | null) {
  return v == null ? '—' : `${v.toFixed(1)}°C`;
}

function coverageWarn(obs: Observation) {
  const pct = obs.stats?.validPct;
  if (pct != null && pct < LOW_COVERAGE) {
    return `Coverage too low (${pct.toFixed(1)}% < ${LOW_COVERAGE}%)`;
  }
  return null;
}

export default function Analysis() {
  const { siteId } = useParams<{ siteId: string }>();
  const [site, setSite] = useState<Site | null>(null);
  const [observation, setObservation] = useState<Observation | null>(null);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [compareA, setCompareA] = useState('');
  const [compareB, setCompareB] = useState('');
  const [compareResult, setCompareResult] = useState<CompareResult | null>(null);
  const [compareError, setCompareError] = useState('');
  const [sceneVisual, setSceneVisual] = useState<SceneVisual>('original');
  const [status, setStatus] = useState('Loading site…');
  const [statusKind, setStatusKind] = useState<'ok' | 'busy' | 'error' | ''>(
    'busy',
  );
  const [weather, setWeather] = useState<WeatherSeries | null>(null);
  const [weatherError, setWeatherError] = useState('');
  const [weatherBusy, setWeatherBusy] = useState(false);
  const [irrigation, setIrrigation] = useState<IrrigationPlan | null>(null);
  const [irrigationError, setIrrigationError] = useState('');
  const [irrigationBusy, setIrrigationBusy] = useState(false);
  const [ndvi, setNdvi] = useState<{
    url: string;
    bounds: [[number, number], [number, number]];
    opacity?: number;
  } | null>(null);

  useEffect(() => {
    if (!siteId) return;
    let cancelled = false;
    (async () => {
      try {
        setStatusKind('busy');
        setStatus('Loading site…');
        const loaded = await api.getSite(siteId);
        if (cancelled) return;
        setSite(loaded);
        const list = await api.listObservations(siteId);
        if (cancelled) return;
        setObservations(list);
        if (list.length >= 2) {
          setCompareA(list[list.length - 1]._id);
          setCompareB(list[0]._id);
        }
        if (list[0]) {
          const obs = await api.getObservation(siteId, list[0]._id);
          if (cancelled) return;
          setObservation(obs);
          applyNdvi(obs, loaded._id);
          setStatus(
            `Ready — scan latest or open a date from history (${list.length} cached).`,
          );
        } else {
          setObservation(null);
          setNdvi(null);
          setStatus('No scans yet — run Scan latest for the newest clear scene.');
        }
        setStatusKind('ok');
      } catch (err) {
        if (!cancelled) {
          setStatus(err instanceof Error ? err.message : 'Failed to load site');
          setStatusKind('error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  useEffect(() => {
    if (!siteId || !observation?.acquiredAt) {
      setWeather(null);
      setWeatherError('');
      return;
    }
    let cancelled = false;
    setWeatherBusy(true);
    api
      .getWeather(siteId, { around: observation.acquiredAt })
      .then((series) => {
        if (!cancelled) {
          setWeather(series);
          setWeatherError('');
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setWeather(null);
          setWeatherError(
            err instanceof Error ? err.message : 'Weather unavailable',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setWeatherBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [siteId, observation?.acquiredAt]);

  function applyNdvi(obs: Observation, sid: string) {
    const bounds = obs.overlay?.bounds;
    if (!bounds) {
      setNdvi(null);
      return;
    }
    const url = obs.overlay?.imageBase64
      ? `data:image/png;base64,${obs.overlay.imageBase64}`
      : `${observationImageUrl(sid, obs._id, 'ndvi')}?t=${Date.now()}`;
    setNdvi({
      url,
      bounds,
      opacity: obs.overlay?.opacity ?? 0.78,
    });
  }

  async function runScan(older = false) {
    if (!site) return;
    try {
      setStatusKind('busy');
      setStatus(
        older
          ? 'Scanning an older clear scene…'
          : 'Scanning latest clear scene…',
      );
      setCompareResult(null);
      setCompareError('');
      const obs = await api.scanSite(site._id, older);
      setObservation(obs);
      applyNdvi(obs, site._id);
      const list = await api.listObservations(site._id);
      setObservations(list);
      if (list.length >= 2) {
        setCompareA(list[list.length - 1]._id);
        setCompareB(list[0]._id);
      }
      const warn = coverageWarn(obs);
      setStatus(
        `Scan ok — ${obs.acquiredAt || 'date?'} · NDVI ${fmtNdvi(obs.stats?.mean)}${
          warn ? ` · ${warn}` : ''
        }`,
      );
      setStatusKind(warn ? 'error' : 'ok');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Scan failed';
      const friendly = /no low-cloud|out of range|already scanned/i.test(msg)
        ? `No clear scene available — ${msg}`
        : msg;
      setStatus(friendly);
      setStatusKind('error');
    }
  }

  async function loadObservation(obsId: string) {
    if (!site) return;
    try {
      setStatusKind('busy');
      setStatus('Loading observation…');
      const obs = await api.getObservation(site._id, obsId);
      setObservation(obs);
      applyNdvi(obs, site._id);
      setStatus(`Loaded ${obs.acquiredAt || obsId}`);
      setStatusKind('ok');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Load failed');
      setStatusKind('error');
    }
  }

  async function runCompare() {
    if (!site || !compareA || !compareB) return;
    try {
      setCompareError('');
      setStatusKind('busy');
      setStatus('Comparing dates…');
      const result = await api.compare(site._id, compareA, compareB);
      setCompareResult(result);
      setStatus(
        `Compared ${result.a.acquiredAt || 'A'} → ${result.b.acquiredAt || 'B'} · Δ ${result.deltaMeanNdvi ?? '—'}`,
      );
      setStatusKind('ok');
    } catch (err) {
      setCompareResult(null);
      setCompareError(err instanceof Error ? err.message : 'Compare failed');
      setStatusKind('error');
    }
  }

  if (!siteId) {
    return (
      <div className="page-empty">
        <p>Missing site id.</p>
        <Link to="/dashboard">Back to dashboard</Link>
      </div>
    );
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <header className="sidebar-hero">
          <p className="crumb">
            <Link to="/sites">Sites</Link>
            <span aria-hidden> / </span>
            <Link to="/analysis">Analysis</Link>
          </p>
          <h1>{site?.name || 'Analysis'}</h1>
          <p className="sub">
            Run the newest clear scene, then compare dates when you have history.
          </p>
        </header>

        <div className={`status-banner ${statusKind || 'idle'}`}>{status}</div>

        <section className="panel composer">
          <div className="panel-head">
            <h2>Scan</h2>
          </div>
          <div className="actions stack">
            <button
              className="primary"
              type="button"
              disabled={!site}
              onClick={() => runScan(false)}
            >
              Scan latest
            </button>
            <button
              className="ghost"
              type="button"
              disabled={!site}
              onClick={() => runScan(true)}
              title="Exclude scenes already saved for this site"
            >
              Scan older date
            </button>
          </div>
        </section>

        {observation && (
          <section className="panel">
            <div className="panel-head">
              <h2>Latest result</h2>
            </div>
            <div className="stat">
              <span>Acquired</span>
              <span>{observation.acquiredAt || '—'}</span>
            </div>
            <div className="stat">
              <span>Cloud</span>
              <span>
                {observation.cloudCover != null
                  ? `${observation.cloudCover}%`
                  : '—'}
              </span>
            </div>
            <div className="stat">
              <span>Avg NDVI</span>
              <span>{fmtNdvi(observation.stats?.mean)}</span>
            </div>
            <div className="stat">
              <span>Min / Max</span>
              <span>
                {fmtNdvi(observation.stats?.min)} /{' '}
                {fmtNdvi(observation.stats?.max)}
              </span>
            </div>
            <div className="legend">
              <span className="legend-label">NDVI legend (unitless −1…1)</span>
              <div className="legend-bar" aria-hidden />
              <div className="legend-ticks">
                <span>low / sparse</span>
                <span>0.2</span>
                <span>0.4</span>
                <span>dense</span>
              </div>
            </div>
            {coverageWarn(observation) && (
              <p className="status error">{coverageWarn(observation)}</p>
            )}
            {site && (
              <div className="visual-compare">
                <div className="visual-head">
                  <span className="legend-label">Scene visual</span>
                  <span className="derived-badge">DERIVED VISUAL</span>
                </div>
                <div className="layer-toggle">
                  <button
                    type="button"
                    className={`chip ${sceneVisual === 'original' ? 'active' : ''}`}
                    onClick={() => setSceneVisual('original')}
                  >
                    Original S2
                  </button>
                  <button
                    type="button"
                    className={`chip ${sceneVisual === 'enhanced' ? 'active' : ''}`}
                    onClick={() => setSceneVisual('enhanced')}
                  >
                    Enhanced view
                  </button>
                </div>
                <img
                  className={
                    sceneVisual === 'enhanced'
                      ? 'scene-thumb enhanced'
                      : 'scene-thumb'
                  }
                  src={observationImageUrl(
                    site._id,
                    observation._id,
                    'truecolor',
                    sceneVisual,
                  )}
                  alt="Sentinel-2 true color derived visual"
                />
                <p className="hint">
                  Same scene as NDVI. Enhanced = display sharpening only.
                </p>
              </div>
            )}
          </section>
        )}

        {observation?.acquiredAt && (
          <section className="panel">
            <div className="panel-head">
              <h2>Weather</h2>
              <button
                className="text-btn"
                type="button"
                disabled={!siteId || weatherBusy}
                onClick={async () => {
                  if (!siteId || !observation.acquiredAt) return;
                  try {
                    setWeatherBusy(true);
                    const series = await api.refreshWeather(siteId, {
                      around: observation.acquiredAt,
                    });
                    setWeather(series);
                    setWeatherError('');
                  } catch (err) {
                    setWeatherError(
                      err instanceof Error ? err.message : 'Refresh failed',
                    );
                  } finally {
                    setWeatherBusy(false);
                  }
                }}
              >
                {weatherBusy ? 'Fetching…' : 'Refresh'}
              </button>
            </div>
            {weatherError && <p className="status error">{weatherError}</p>}
            {weather?.sceneDay && (
              <>
                <div className="stat">
                  <span>Rain (scene day)</span>
                  <span>{fmtMm(weather.sceneDay.precipMm)}</span>
                </div>
                <div className="stat">
                  <span>Temp mean / max</span>
                  <span>
                    {fmtC(weather.sceneDay.tempMeanC)} /{' '}
                    {fmtC(weather.sceneDay.tempMaxC)}
                  </span>
                </div>
                <div className="stat">
                  <span>ET₀ (FAO)</span>
                  <span>{fmtMm(weather.sceneDay.et0Mm)}</span>
                </div>
              </>
            )}
            {weather && weather.days.length > 0 && (
              <div className="weather-strip" aria-label="7-day weather context">
                {weather.days.map((d) => {
                  const active = d.date === weather.sceneDay?.date;
                  const rain = d.precipMm ?? 0;
                  const height = Math.min(100, Math.round((rain / 12) * 100));
                  return (
                    <div
                      key={d.date}
                      className={`weather-day${active ? ' active' : ''}`}
                      title={`${d.date}: ${fmtMm(d.precipMm)}, ${fmtC(d.tempMeanC)}`}
                    >
                      <div className="weather-bar-wrap">
                        <div
                          className="weather-bar"
                          style={{ height: `${Math.max(height, rain > 0 ? 8 : 2)}%` }}
                        />
                      </div>
                      <span className="weather-day-label">
                        {d.date.slice(5)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="hint">
              {weather?.source || 'Open-Meteo'} · cached for later · context
              only — not a drought diagnosis
            </p>
          </section>
        )}

        <section className="panel">
          <div className="panel-head">
            <h2>Irrigation advisor</h2>
            <button
              className="text-btn"
              type="button"
              disabled={!siteId || irrigationBusy}
              onClick={async () => {
                if (!siteId) return;
                try {
                  setIrrigationBusy(true);
                  setIrrigationError('');
                  const plan = await api.irrigationPlan(
                    siteId,
                    observation?._id,
                  );
                  setIrrigation(plan);
                  setStatus('Irrigation plan ready.');
                  setStatusKind('ok');
                } catch (err) {
                  setIrrigation(null);
                  setIrrigationError(
                    err instanceof Error ? err.message : 'Plan failed',
                  );
                  setStatusKind('error');
                } finally {
                  setIrrigationBusy(false);
                }
              }}
            >
              {irrigationBusy ? 'Planning…' : 'Plan irrigation'}
            </button>
          </div>
          {site && (
            <p className="hint tight">
              Profile:{' '}
              {site.plantType && site.plantAge && site.soilType
                ? `${site.plantType} · ${site.plantAge} · ${site.soilType}`
                : 'incomplete — set type plante / âge / terre on Sites'}
            </p>
          )}
          {irrigationError && (
            <p className="status error">{irrigationError}</p>
          )}
          {irrigation && (
            <>
              <div className="stat">
                <span>ETc (est.)</span>
                <span>{irrigation.estimate.etcMmPerDay} mm/day</span>
              </div>
              <div className="stat">
                <span>7-day need</span>
                <span>
                  {irrigation.estimate.need7Mm} mm ·{' '}
                  {irrigation.estimate.need7M3} m³
                </span>
              </div>
              <div className="stat">
                <span>Pulse</span>
                <span>
                  ~{irrigation.estimate.perEventMm} mm /{' '}
                  {irrigation.estimate.intervalDays}d
                </span>
              </div>
              <p className="compare">{irrigation.narrative.text}</p>
              <ul className="schedule-list">
                {irrigation.schedule.map((row) => (
                  <li key={row.date} className={`sched-${row.action}`}>
                    <strong>{row.date}</strong>
                    <span>
                      {row.action}
                      {row.volumeMm > 0
                        ? ` · ${row.volumeMm} mm (${row.volumeM3} m³)`
                        : ''}
                    </span>
                    <em>{row.reason}</em>
                  </li>
                ))}
              </ul>
              <p className="hint">
                {irrigation.label} · narrative via {irrigation.narrative.source}
              </p>
              <p className="hint">{irrigation.honesty}</p>
            </>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>History ({observations.length})</h2>
          </div>
          {observations.length === 0 ? (
            <div className="empty-block">
              <p>No scans yet</p>
              <span>Tap Scan latest for the newest clear Sentinel-2 date.</span>
            </div>
          ) : (
            <ul className="history-list">
              {observations.map((o) => (
                <li key={o._id}>
                  <button type="button" onClick={() => loadObservation(o._id)}>
                    <strong>{o.acquiredAt || 'undated'}</strong>
                    <span>
                      NDVI {fmtNdvi(o.stats?.mean)} · cloud{' '}
                      {o.cloudCover != null ? `${o.cloudCover}%` : '—'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {observations.length >= 2 && (
          <section className="panel">
            <div className="panel-head">
              <h2>Compare</h2>
            </div>
            <label className="field">
              <span>Earlier</span>
              <select
                value={compareA}
                onChange={(e) => setCompareA(e.target.value)}
              >
                {observations.map((o) => (
                  <option key={o._id} value={o._id}>
                    {o.acquiredAt || o._id} · NDVI {fmtNdvi(o.stats?.mean)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Later</span>
              <select
                value={compareB}
                onChange={(e) => setCompareB(e.target.value)}
              >
                {observations.map((o) => (
                  <option key={o._id} value={o._id}>
                    {o.acquiredAt || o._id} · NDVI {fmtNdvi(o.stats?.mean)}
                  </option>
                ))}
              </select>
            </label>
            <button className="primary" type="button" onClick={runCompare}>
              Compare
            </button>
            {compareError && <p className="status error">{compareError}</p>}
            {compareResult && (
              <div className="compare-box">
                <p className="compare">
                  Δ mean NDVI:{' '}
                  <strong>{compareResult.deltaMeanNdvi ?? '—'}</strong>
                  {compareResult.inspect.flag ? (
                    <span className="inspect-badge"> INSPECT</span>
                  ) : null}
                </p>
                <p className="hint">{compareResult.inspect.reason}</p>
                {compareResult.inspect.evidence && (
                  <ul className="evidence">
                    {compareResult.inspect.evidence.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                )}
                {compareResult.interpretation && (
                  <div
                    className={`interpretation ${
                      compareResult.inspect.flag ? 'flagged' : ''
                    }`}
                  >
                    <h3>{compareResult.interpretation.label}</h3>
                    <p>{compareResult.interpretation.text}</p>
                  </div>
                )}
                {site && (
                  <a
                    className="report-link"
                    href={api.reportUrl(site._id, compareA, compareB)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open HTML report
                  </a>
                )}
              </div>
            )}
          </section>
        )}
      </aside>
      <FieldMap
        editable={false}
        boundary={site?.boundary || null}
        ndvi={ndvi}
      />
    </div>
  );
}
