import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  CalendarDays,
  Cloud,
  CloudRain,
  CloudSun,
  Droplets,
  FileText,
  Gauge,
  GitCompareArrows,
  GripVertical,
  History,
  ImageOff,
  Leaf,
  RefreshCw,
  Satellite,
  Sparkles,
  Sprout,
  Thermometer,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
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
type AnalysisTab = 'scene' | 'weather' | 'water' | 'history';
type DockPos = { x: number; y: number };

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
    return `Not enough clear pixels (${pct.toFixed(1)}% usable — need ${LOW_COVERAGE}%+)`;
  }
  return null;
}

function StatRow({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="stat">
      <span className="stat-label">
        <Icon size={14} strokeWidth={2} aria-hidden />
        {label}
      </span>
      <span>{value}</span>
    </div>
  );
}

function EmptyHint({
  icon: Icon,
  title,
  text,
}: {
  icon: LucideIcon;
  title: string;
  text: string;
}) {
  return (
    <div className="empty-block empty-block-icon">
      <Icon size={22} strokeWidth={1.75} aria-hidden />
      <p>{title}</p>
      <span>{text}</span>
    </div>
  );
}

function formatPlanDate(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function waterActionLabel(action: string) {
  switch (action) {
    case 'irrigate':
      return 'Water the field';
    case 'skip':
      return 'No watering';
    case 'inspect':
      return 'Check the crop first';
    default:
      return action;
  }
}

function pumpQualityLabel(quality: string, startHour?: number, endHour?: number) {
  if (quality === 'soft' && startHour != null && endHour != null) {
    return `${String(startHour).padStart(2, '0')}:00–${String(endHour).padStart(2, '0')}:00`;
  }
  if (quality === 'skip') return 'Skip pumping';
  if (quality === 'blocked') return 'Paused — check crop';
  return quality;
}

export default function Analysis() {
  const { siteId } = useParams<{ siteId: string }>();
  const rootRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const [dockPos, setDockPos] = useState<DockPos | null>(null);
  const [dragging, setDragging] = useState(false);
  const [tab, setTab] = useState<AnalysisTab>('scene');
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

  const clampDockPos = useCallback((x: number, y: number): DockPos => {
    const root = rootRef.current;
    const dock = dockRef.current;
    if (!root || !dock) return { x, y };
    const pad = 8;
    const maxX = Math.max(pad, root.clientWidth - dock.offsetWidth - pad);
    const maxY = Math.max(pad, root.clientHeight - dock.offsetHeight - pad);
    return {
      x: Math.min(maxX, Math.max(pad, x)),
      y: Math.min(maxY, Math.max(pad, y)),
    };
  }, []);

  function onDockPointerDown(e: React.PointerEvent<HTMLElement>) {
    if (e.button !== 0) return;
    const dock = dockRef.current;
    const root = rootRef.current;
    if (!dock || !root) return;
    const rect = dock.getBoundingClientRect();
    const rootRect = root.getBoundingClientRect();
    const origX = rect.left - rootRect.left;
    const origY = rect.top - rootRect.top;
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origX,
      origY,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    setDockPos({ x: origX, y: origY });
  }

  function onDockPointerMove(e: React.PointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    setDockPos(
      clampDockPos(
        drag.origX + (e.clientX - drag.startX),
        drag.origY + (e.clientY - drag.startY),
      ),
    );
  }

  function onDockPointerUp(e: React.PointerEvent<HTMLElement>) {
    if (dragRef.current?.pointerId !== e.pointerId) return;
    dragRef.current = null;
    setDragging(false);
  }

  useEffect(() => {
    if (!dockPos) return;
    const onResize = () => {
      setDockPos((pos) => (pos ? clampDockPos(pos.x, pos.y) : pos));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [dockPos, clampDockPos]);
  const [weather, setWeather] = useState<WeatherSeries | null>(null);
  const [weatherError, setWeatherError] = useState('');
  const [weatherBusy, setWeatherBusy] = useState(false);
  const [irrigation, setIrrigation] = useState<IrrigationPlan | null>(null);
  const [irrigationError, setIrrigationError] = useState('');
  const [irrigationBusy, setIrrigationBusy] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [reports, setReports] = useState<
    {
      _id: string;
      title: string;
      dateA?: string;
      dateB?: string;
      deltaMeanNdvi?: number | null;
      inspectFlag?: boolean;
    }[]
  >([]);
  const [savedReportId, setSavedReportId] = useState<string | null>(null);
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

  async function refreshReports(sid: string) {
    try {
      const list = await api.listReports(sid);
      setReports(list);
    } catch {
      /* ignore list errors */
    }
  }

  useEffect(() => {
    if (!siteId) return;
    void refreshReports(siteId);
  }, [siteId]);

  async function runCompare() {
    if (!site || !compareA || !compareB) return;
    try {
      setCompareError('');
      setStatusKind('busy');
      setStatus('Comparing dates…');
      const result = await api.compare(site._id, compareA, compareB);
      setCompareResult(result);
      setStatus('Saving report to database…');
      const saved = await api.saveReport(site._id, compareA, compareB);
      setSavedReportId(saved.reportId);
      await refreshReports(site._id);
      setStatus(
        `Compared ${result.a.acquiredAt || 'A'} → ${result.b.acquiredAt || 'B'} · report saved`,
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
    <div className="map-workspace" ref={rootRef}>
      <FieldMap
        editable={false}
        boundary={site?.boundary || null}
        ndvi={ndvi}
      />

      <div
        className={`float-dock${dragging ? ' is-dragging' : ''}${dockPos ? ' is-placed' : ''}`}
        ref={dockRef}
        style={
          dockPos
            ? { left: dockPos.x, top: dockPos.y, right: 'auto' }
            : undefined
        }
      >
        <header
          className="float-dock-head"
          onPointerDown={onDockPointerDown}
          onPointerMove={onDockPointerMove}
          onPointerUp={onDockPointerUp}
          onPointerCancel={onDockPointerUp}
        >
          <div className="float-dock-drag">
            <GripVertical
              className="float-dock-grip-icon"
              size={18}
              strokeWidth={2}
              aria-hidden
            />
            <div>
              <p className="crumb">
                <Link to="/sites">Sites</Link>
                <span aria-hidden> / </span>
                <Link to="/analysis">Analysis</Link>
              </p>
              <h1>{site?.name || 'Analysis'}</h1>
            </div>
          </div>
          <p className={`float-dock-status ${statusKind || 'idle'}`}>{status}</p>
        </header>

        <div className="float-dock-actions">
          <button
            className="primary scan-action-btn"
            type="button"
            disabled={!site || statusKind === 'busy'}
            onClick={() => runScan(false)}
          >
            <span className="scan-action-main">
              <Satellite size={15} strokeWidth={2} aria-hidden />
              Scan now
            </span>
            <span className="scan-action-date">Newest clear day</span>
          </button>
          <button
            className="ghost scan-action-btn"
            type="button"
            disabled={!site || statusKind === 'busy'}
            onClick={() => runScan(true)}
            title="Fetch an earlier clear day you have not scanned yet"
          >
            <span className="scan-action-main">
              <History size={15} strokeWidth={2} aria-hidden />
              Earlier day
            </span>
            <span className="scan-action-date">
              {observations[1]?.acquiredAt
                ? `Next older: ${formatPlanDate(observations[1].acquiredAt)}`
                : 'Older clear day'}
            </span>
          </button>
        </div>

        <div className="float-dock-tabs" role="tablist">
          {(
            [
              ['scene', 'Crop view'],
              ['weather', 'Conditions'],
              ['water', 'Irrigation'],
              ['history', 'Past scans'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={tab === id ? 'active' : ''}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="float-dock-body">
          {tab === 'scene' && (
            <section className="panel">
              {!observation ? (
                <EmptyHint
                  icon={ImageOff}
                  title="No crop scan yet"
                  text="Press Scan now to fetch the clearest recent satellite image for this field."
                />
              ) : (
                <>
                  <div className="panel-head">
                    <h2 className="panel-title-icon">
                      <Leaf size={14} strokeWidth={2} aria-hidden />
                      How green is the crop?
                    </h2>
                  </div>
                  <StatRow
                    icon={CalendarDays}
                    label="Scan date"
                    value={observation.acquiredAt || '—'}
                  />
                  <StatRow
                    icon={Cloud}
                    label="Cloud cover"
                    value={
                      observation.cloudCover != null
                        ? `${observation.cloudCover}%`
                        : '—'
                    }
                  />
                  <StatRow
                    icon={Sprout}
                    label="Plant greenness"
                    value={fmtNdvi(observation.stats?.mean)}
                  />
                  <StatRow
                    icon={Gauge}
                    label="Lowest / highest"
                    value={
                      <>
                        {fmtNdvi(observation.stats?.min)} /{' '}
                        {fmtNdvi(observation.stats?.max)}
                      </>
                    }
                  />
                  <div className="legend">
                    <span className="legend-label">
                      Greenness scale (NDVI)
                    </span>
                    <div className="legend-bar" aria-hidden />
                    <div className="legend-ticks">
                      <span>sparse</span>
                      <span>0.2</span>
                      <span>0.4</span>
                      <span>lush</span>
                    </div>
                  </div>
                  {coverageWarn(observation) && (
                    <p className="status error">{coverageWarn(observation)}</p>
                  )}
                  {site && (
                    <div className="visual-compare">
                      <div className="visual-head">
                        <span className="legend-label">
                          <Satellite size={13} strokeWidth={2} aria-hidden />
                          Field photo
                        </span>
                        <span className="derived-badge">From satellite</span>
                      </div>
                      <div className="layer-toggle">
                        <button
                          type="button"
                          className={`chip ${sceneVisual === 'original' ? 'active' : ''}`}
                          onClick={() => setSceneVisual('original')}
                        >
                          Natural look
                        </button>
                        <button
                          type="button"
                          className={`chip ${sceneVisual === 'enhanced' ? 'active' : ''}`}
                          onClick={() => setSceneVisual('enhanced')}
                        >
                          <Sparkles size={13} strokeWidth={2} aria-hidden />
                          Sharper look
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
                        alt="Satellite true-color view of the field"
                      />
                      <p className="hint">
                        Same day as the greenness map. Sharper look only
                        improves the display — not the numbers.
                      </p>
                    </div>
                  )}
                </>
              )}
            </section>
          )}

          {tab === 'weather' && (
            <section className="panel">
              <div className="panel-head">
                <h2 className="panel-title-icon">
                  <CloudSun size={14} strokeWidth={2} aria-hidden />
                  Around the scan day
                </h2>
                <button
                  className="text-btn"
                  type="button"
                  disabled={!siteId || !observation?.acquiredAt || weatherBusy}
                  onClick={async () => {
                    if (!siteId || !observation?.acquiredAt) return;
                    try {
                      setWeatherBusy(true);
                      const series = await api.refreshWeather(siteId, {
                        around: observation.acquiredAt,
                      });
                      setWeather(series);
                      setWeatherError('');
                    } catch (err) {
                      setWeatherError(
                        err instanceof Error
                          ? err.message
                          : 'Could not update weather',
                      );
                    } finally {
                      setWeatherBusy(false);
                    }
                  }}
                >
                  <RefreshCw size={13} strokeWidth={2} aria-hidden />
                  {weatherBusy ? 'Updating…' : 'Update'}
                </button>
              </div>
              {!observation?.acquiredAt ? (
                <EmptyHint
                  icon={CloudSun}
                  title="Need a crop scan first"
                  text="Scan your field, then we’ll show rain and temperature around that day."
                />
              ) : (
                <>
                  {weatherError && (
                    <p className="status error">{weatherError}</p>
                  )}
                  {weather?.sceneDay && (
                    <>
                      <StatRow
                        icon={CloudRain}
                        label="Rain on scan day"
                        value={fmtMm(weather.sceneDay.precipMm)}
                      />
                      <StatRow
                        icon={Thermometer}
                        label="Air temperature"
                        value={
                          <>
                            {fmtC(weather.sceneDay.tempMeanC)} avg /{' '}
                            {fmtC(weather.sceneDay.tempMaxC)} max
                          </>
                        }
                      />
                      <StatRow
                        icon={Sprout}
                        label="Plant water loss"
                        value={fmtMm(weather.sceneDay.et0Mm)}
                      />
                    </>
                  )}
                  {weather && weather.days.length > 0 && (
                    <div
                      className="weather-strip"
                      aria-label="Rain over nearby days"
                    >
                      {weather.days.map((d) => {
                        const active = d.date === weather.sceneDay?.date;
                        const rain = d.precipMm ?? 0;
                        const height = Math.min(
                          100,
                          Math.round((rain / 12) * 100),
                        );
                        return (
                          <div
                            key={d.date}
                            className={`weather-day${active ? ' active' : ''}`}
                            title={`${d.date}: ${fmtMm(d.precipMm)}, ${fmtC(d.tempMeanC)}`}
                          >
                            <div className="weather-bar-wrap">
                              <div
                                className="weather-bar"
                                style={{
                                  height: `${Math.max(height, rain > 0 ? 8 : 2)}%`,
                                }}
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
                    Nearby weather for context only — not a drought diagnosis.
                  </p>
                </>
              )}
            </section>
          )}

          {tab === 'water' && (
            <section className="panel">
              <div className="panel-head">
                <h2 className="panel-title-icon">
                  <Droplets size={14} strokeWidth={2} aria-hidden />
                  Watering advice
                </h2>
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
                      setPlanOpen(true);
                      setStatus('Watering plan ready.');
                      setStatusKind('ok');
                    } catch (err) {
                      setIrrigation(null);
                      setPlanOpen(false);
                      setIrrigationError(
                        err instanceof Error
                          ? err.message
                          : 'Could not build a plan',
                      );
                      setStatusKind('error');
                    } finally {
                      setIrrigationBusy(false);
                    }
                  }}
                >
                  <Droplets size={13} strokeWidth={2} aria-hidden />
                  {irrigationBusy ? 'Building…' : 'Make a plan'}
                </button>
              </div>
              {site && (
                <p className="hint tight">
                  Crop profile:{' '}
                  {site.plantType && site.plantAge && site.soilType
                    ? `${site.plantType} · ${site.plantAge} · ${site.soilType}`
                    : 'incomplete — add crop type, age, and soil on Sites'}
                </p>
              )}
              {irrigationError && (
                <p className="status error">{irrigationError}</p>
              )}
              {!irrigation && !irrigationError && (
                <EmptyHint
                  icon={Droplets}
                  title="No watering plan yet"
                  text="Tap Make a plan for a simple 7-day schedule based on your crop and recent conditions."
                />
              )}
              {irrigation && (
                <>
                  <StatRow
                    icon={Sprout}
                    label="Daily crop need"
                    value={`${irrigation.estimate.etcMmPerDay} mm/day`}
                  />
                  <StatRow
                    icon={CalendarDays}
                    label="Next 7 days"
                    value={`${irrigation.estimate.need7Mm} mm`}
                  />
                  <p className="hint tight">
                    Full schedule opens in a larger window for easy reading.
                  </p>
                  <button
                    className="primary"
                    type="button"
                    onClick={() => setPlanOpen(true)}
                  >
                    <Droplets size={15} strokeWidth={2} aria-hidden />
                    Open watering plan
                  </button>
                </>
              )}
            </section>
          )}

          {tab === 'history' && (
            <>
              <section className="panel">
                <div className="panel-head">
                  <h2 className="panel-title-icon">
                    <History size={14} strokeWidth={2} aria-hidden />
                    Past scans ({observations.length})
                  </h2>
                </div>
                {observations.length === 0 ? (
                  <EmptyHint
                    icon={Satellite}
                    title="No scans yet"
                    text="Press Scan now for the clearest recent satellite day."
                  />
                ) : (
                  <ul className="history-list">
                    {observations.map((o) => (
                      <li key={o._id}>
                        <button
                          type="button"
                          onClick={() => loadObservation(o._id)}
                        >
                          <strong className="history-item-title">
                            <CalendarDays
                              size={13}
                              strokeWidth={2}
                              aria-hidden
                            />
                            {o.acquiredAt || 'undated'}
                          </strong>
                          <span>
                            Greenness {fmtNdvi(o.stats?.mean)} · clouds{' '}
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
                    <h2 className="panel-title-icon">
                      <GitCompareArrows
                        size={14}
                        strokeWidth={2}
                        aria-hidden
                      />
                      Compare two days
                    </h2>
                  </div>
                  <label className="field">
                    <span className="field-label-icon">
                      <CalendarDays size={13} strokeWidth={2} aria-hidden />
                      Earlier day
                    </span>
                    <select
                      value={compareA}
                      onChange={(e) => setCompareA(e.target.value)}
                    >
                      {observations.map((o) => (
                        <option key={o._id} value={o._id}>
                          {o.acquiredAt || o._id} ·{' '}
                          {fmtNdvi(o.stats?.mean)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span className="field-label-icon">
                      <CalendarDays size={13} strokeWidth={2} aria-hidden />
                      Later day
                    </span>
                    <select
                      value={compareB}
                      onChange={(e) => setCompareB(e.target.value)}
                    >
                      {observations.map((o) => (
                        <option key={o._id} value={o._id}>
                          {o.acquiredAt || o._id} ·{' '}
                          {fmtNdvi(o.stats?.mean)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="primary"
                    type="button"
                    onClick={runCompare}
                  >
                    <GitCompareArrows
                      size={15}
                      strokeWidth={2}
                      aria-hidden
                    />
                    Compare
                  </button>
                  {compareError && (
                    <p className="status error">{compareError}</p>
                  )}
                  {compareResult && (
                    <div className="compare-box">
                      <p className="compare">
                        Greenness change:{' '}
                        <strong>{compareResult.deltaMeanNdvi ?? '—'}</strong>
                        {compareResult.inspect.flag ? (
                          <span className="inspect-badge">
                            <AlertTriangle
                              size={12}
                              strokeWidth={2}
                              aria-hidden
                            />{' '}
                            Check field
                          </span>
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
                        <div className="report-actions">
                          <a
                            className="report-link"
                            href={
                              savedReportId
                                ? api.savedReportUrl(site._id, savedReportId)
                                : api.reportUrl(site._id, compareA, compareB)
                            }
                            target="_blank"
                            rel="noreferrer"
                          >
                            <FileText size={14} strokeWidth={2} aria-hidden />
                            Open report
                          </a>
                          <a
                            className="report-link pdf"
                            href={
                              savedReportId
                                ? api.savedReportUrl(
                                    site._id,
                                    savedReportId,
                                    true,
                                  )
                                : api.reportUrl(
                                    site._id,
                                    compareA,
                                    compareB,
                                    true,
                                  )
                            }
                            target="_blank"
                            rel="noreferrer"
                          >
                            <FileText size={14} strokeWidth={2} aria-hidden />
                            Save PDF
                          </a>
                          {savedReportId && (
                            <span className="hint tight">
                              Saved · use the PDF print dialog
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </section>
              )}

              {reports.length > 0 && (
                <section className="panel">
                  <div className="panel-head">
                    <h2 className="panel-title-icon">
                      <FileText size={14} strokeWidth={2} aria-hidden />
                      Saved reports ({reports.length})
                    </h2>
                  </div>
                  <ul className="history-list">
                    {reports.map((r) => (
                      <li key={r._id}>
                        <div className="report-row">
                          <a
                            className="report-link"
                            href={api.savedReportUrl(siteId, r._id)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <strong>
                              {r.dateA || '?'} → {r.dateB || '?'}
                            </strong>
                            <span>
                              Δ {r.deltaMeanNdvi ?? '—'}
                              {r.inspectFlag ? ' · check field' : ''}
                            </span>
                          </a>
                          <a
                            className="ghost compact"
                            href={api.savedReportUrl(siteId, r._id, true)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <FileText size={13} strokeWidth={2} aria-hidden />
                            PDF
                          </a>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>
      </div>

      {planOpen && irrigation && (
        <div className="plan-layer" role="presentation">
          <button
            type="button"
            className="plan-backdrop"
            aria-label="Close watering plan"
            onClick={() => setPlanOpen(false)}
          />
          <div
            className="plan-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Watering plan"
          >
            <header className="plan-modal-head">
              <div>
                <p className="eyebrow">
                  <Droplets size={14} strokeWidth={2} aria-hidden />
                  Watering plan
                </p>
                <h2>{site?.name || 'Your field'}</h2>
                <p className="plan-modal-sub">
                  Simple 7-day guide — how much water and when to turn the pump
                  on.
                </p>
              </div>
              <button
                type="button"
                className="plan-close"
                aria-label="Close"
                onClick={() => setPlanOpen(false)}
              >
                <X size={18} strokeWidth={2} aria-hidden />
              </button>
            </header>

            <div className="plan-modal-body">
              <div className="plan-summary">
                <div className="plan-kpi">
                  <span>Daily crop need</span>
                  <strong>{irrigation.estimate.etcMmPerDay} mm</strong>
                  <em>per day</em>
                </div>
                <div className="plan-kpi">
                  <span>Next 7 days</span>
                  <strong>{irrigation.estimate.need7Mm} mm</strong>
                  <em>~{irrigation.estimate.need7M3} m³ total</em>
                </div>
                <div className="plan-kpi">
                  <span>Each watering</span>
                  <strong>~{irrigation.estimate.perEventMm} mm</strong>
                  <em>every {irrigation.estimate.intervalDays} day(s)</em>
                </div>
              </div>

              {irrigation.narrative.text && (
                <p className="plan-advice">{irrigation.narrative.text}</p>
              )}

              <section className="plan-section">
                <h3>
                  <CalendarDays size={16} strokeWidth={2} aria-hidden />
                  What to do each day
                </h3>
                <div className="plan-table-wrap">
                  <table className="plan-table">
                    <thead>
                      <tr>
                        <th>Day</th>
                        <th>Action</th>
                        <th>Water</th>
                        <th>Why</th>
                      </tr>
                    </thead>
                    <tbody>
                      {irrigation.schedule.map((row) => (
                        <tr
                          key={row.date}
                          className={`plan-row-${row.action}`}
                        >
                          <td>
                            <strong>{formatPlanDate(row.date)}</strong>
                            <span className="plan-date-iso">{row.date}</span>
                          </td>
                          <td>
                            <span
                              className={`plan-pill plan-pill-${row.action}`}
                            >
                              {waterActionLabel(row.action)}
                            </span>
                          </td>
                          <td>
                            {row.volumeMm > 0
                              ? `${row.volumeMm} mm (~${row.volumeM3} m³)`
                              : '—'}
                          </td>
                          <td>{row.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {irrigation.pumpWindows && (
                <section className="plan-section">
                  <h3>
                    <Zap size={16} strokeWidth={2} aria-hidden />
                    Best times to pump
                  </h3>
                  {irrigation.pumpWindows.summary.blockedByInspect && (
                    <p className="status error">
                      Pump timing paused — check the crop view first.
                    </p>
                  )}
                  <div className="plan-summary plan-summary-tight">
                    <div className="plan-kpi">
                      <span>Good pump windows</span>
                      <strong>
                        {irrigation.pumpWindows.summary.softWindows}
                      </strong>
                    </div>
                    <div className="plan-kpi">
                      <span>Est. energy</span>
                      <strong>
                        ~{irrigation.pumpWindows.summary.totalKwhEstimate} kWh
                      </strong>
                    </div>
                    <div className="plan-kpi">
                      <span>Saved vs peak</span>
                      <strong>
                        ~
                        {
                          irrigation.pumpWindows.summary.totalKwhSavedVsPeak
                        }{' '}
                        kWh
                      </strong>
                    </div>
                  </div>
                  <div className="plan-table-wrap">
                    <table className="plan-table">
                      <thead>
                        <tr>
                          <th>Day</th>
                          <th>Preferred hours</th>
                          <th>Water</th>
                          <th>Energy</th>
                          <th>Why</th>
                        </tr>
                      </thead>
                      <tbody>
                        {irrigation.pumpWindows.windows.map((row) => (
                          <tr
                            key={`pw-${row.date}`}
                            className={`plan-row-pump-${row.quality}`}
                          >
                            <td>
                              <strong>{formatPlanDate(row.date)}</strong>
                              <span className="plan-date-iso">{row.date}</span>
                            </td>
                            <td>
                              <span
                                className={`plan-pill plan-pill-pump-${row.quality}`}
                              >
                                {pumpQualityLabel(
                                  row.quality,
                                  row.startHour,
                                  row.endHour,
                                )}
                              </span>
                            </td>
                            <td>
                              {row.volumeM3 > 0
                                ? `${row.volumeMm} mm (~${row.volumeM3} m³)`
                                : '—'}
                            </td>
                            <td>
                              {row.estimatedKwh > 0
                                ? `~${row.estimatedKwh} kWh`
                                : '—'}
                            </td>
                            <td>{row.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              <p className="plan-honesty">{irrigation.honesty}</p>
              {irrigation.pumpWindows?.honesty && (
                <p className="plan-honesty">
                  {irrigation.pumpWindows.honesty}
                </p>
              )}
            </div>

            <footer className="plan-modal-foot">
              <button
                type="button"
                className="primary"
                onClick={() => setPlanOpen(false)}
              >
                Got it
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
