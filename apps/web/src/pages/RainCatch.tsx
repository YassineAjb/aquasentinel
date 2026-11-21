import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Site } from '../api';
import RainCatchMap from '../components/RainCatchMap';
import RainCatchTerrain3D from '../components/RainCatchTerrain3D';
import { DEMO_DISCLAIMER, ringBounds } from '../raincatch/engine/demoTerrain';
import { SCENARIOS, SOILS } from '../raincatch/config';
import type { VizMode } from '../raincatch/renderOverlay';
import { actions, useRainCatch } from '../raincatch/store';
import type { SoilType } from '../raincatch/types';

function fmtHa(m2?: number) {
  return m2 == null ? '—' : `${(m2 / 1e4).toFixed(2)} ha`;
}

function fmtM3(v?: number) {
  return v == null ? '—' : `${Math.round(v).toLocaleString()} m³`;
}

function busyStatuses(status: string) {
  return status === 'parsing' || status === 'analyzing';
}

function polygonCentroid(boundary: Site['boundary']): { lat: number; lon: number } {
  const ring = boundary.coordinates[0] ?? [];
  if (ring.length === 0) return { lat: 36.8644, lon: 9.9736 };
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[i + 1];
    const cross = x0 * y1 - x1 * y0;
    area += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  area *= 0.5;
  if (Math.abs(area) < 1e-12) {
    let lon = 0;
    let lat = 0;
    const n = Math.max(1, ring.length - 1);
    for (let i = 0; i < n; i++) {
      lon += ring[i][0];
      lat += ring[i][1];
    }
    return { lon: lon / n, lat: lat / n };
  }
  return { lon: cx / (6 * area), lat: cy / (6 * area) };
}

function mapSoil(soilType?: string): SoilType | undefined {
  if (!soilType) return undefined;
  const s = soilType.toLowerCase();
  if (s.includes('sable') || s === 'sand' || s === 'sandy') return 'sand';
  if (s.includes('argil') || s === 'clay') return 'clay';
  if (s.includes('limon') || s.includes('loam')) return 'loam';
  return undefined;
}

const VIZ: { id: VizMode; label: string }[] = [
  { id: 'elevation', label: 'Elevation' },
  { id: 'water', label: 'Ponding' },
  { id: 'flood', label: 'Flood' },
  { id: 'slope', label: 'Slope' },
];

export default function RainCatch() {
  const state = useRainCatch();
  const [viz, setViz] = useState<VizMode>('elevation');
  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState('');
  const [panelOpen, setPanelOpen] = useState(true);
  const [showMore, setShowMore] = useState(false);
  const [heightStretch, setHeightStretch] = useState(12);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await api.listSites();
        if (cancelled) return;
        setSites(list);
        if (list[0]) setSiteId(list[0]._id);
      } catch {
        /* status shown via empty sites */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const site = useMemo(
    () => sites.find((s) => s._id === siteId) ?? null,
    [sites, siteId],
  );

  const selected = useMemo(
    () =>
      state.sim?.candidates.find((c) => c.id === state.selection.candidateId) ??
      null,
    [state.sim, state.selection.candidateId],
  );

  const busy = busyStatuses(state.status);
  const ready = state.status === 'ready' && !!state.analysis;

  async function explore() {
    if (!site) return;
    const ring = (site.boundary.coordinates[0] ?? []).map(
      ([lon, lat]) => [lon, lat] as [number, number],
    );
    await actions.exploreSite({
      name: site.name,
      center: polygonCentroid(site.boundary),
      siteId: site._id,
      soil: mapSoil(site.soilType),
      bounds: ringBounds(ring) ?? undefined,
      polygon: ring.length >= 3 ? ring : undefined,
    });
    setViz('water');
    actions.setView('3d');
  }

  return (
    <div className="rc-stage">
      {state.view === '3d' && state.analysis ? (
        <RainCatchTerrain3D
          analysis={state.analysis}
          floodScore={state.sim?.floodScore}
          waterDepth={state.sim?.waterDepth}
          candidates={state.sim?.candidates}
          selectedCandidateId={state.selection.candidateId}
          mode={viz}
          heightStretch={heightStretch}
          onPickCandidate={(id) => actions.selectCandidate(id)}
        />
      ) : (
        <RainCatchMap
          site={site}
          analysis={state.analysis}
          floodScore={state.sim?.floodScore}
          waterDepth={state.sim?.waterDepth}
          candidates={state.sim?.candidates}
          selectedCandidateId={state.selection.candidateId}
          mode={viz}
          opacity={state.layerOpacity}
          onPickCandidate={(id) => actions.selectCandidate(id)}
        />
      )}

      {!panelOpen && (
        <button
          type="button"
          className="rc-fab"
          onClick={() => setPanelOpen(true)}
          aria-label="Open controls"
        >
          RainCatch
        </button>
      )}

      {panelOpen && (
        <aside className="rc-float" aria-label="RainCatch controls">
          <header className="rc-float-head">
            <div>
              <p className="eyebrow">RainCatch</p>
              <h1>Field drainage</h1>
            </div>
            <button
              type="button"
              className="rc-icon-btn"
              aria-label="Collapse panel"
              onClick={() => setPanelOpen(false)}
            >
              −
            </button>
          </header>

          <p className="rc-float-lead">
            See where water pools on your field — simulated terrain on the map.
          </p>

          <label className="field">
            Your field
            <select
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
              disabled={busy || sites.length === 0}
            >
              {sites.length === 0 ? (
                <option value="">No sites yet</option>
              ) : (
                sites.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name}
                    {s.areaM2 ? ` · ${fmtHa(s.areaM2)}` : ''}
                  </option>
                ))
              )}
            </select>
          </label>

          {sites.length === 0 ? (
            <Link className="ghost inline" to="/sites">
              Draw a site first
            </Link>
          ) : (
            <button
              className="primary"
              type="button"
              disabled={!site || busy}
              onClick={() => void explore()}
            >
              {busy ? 'Simulating…' : ready ? 'Re-run simulation' : 'Explore your site'}
            </button>
          )}

          {state.summary?.isDemo && (
            <p className="rc-sim-badge" role="note">
              Simulated LiDAR · not a real survey
            </p>
          )}

          {ready && (
            <>
              <div className="rc-divider" />

              <div className="rc-section-label">View</div>
              <div className="rc-chip-row" role="tablist" aria-label="View mode">
                <button
                  type="button"
                  role="tab"
                  aria-selected={state.view === '2d'}
                  className={`rc-chip${state.view === '2d' ? ' active' : ''}`}
                  onClick={() => actions.setView('2d')}
                >
                  Map 2D
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={state.view === '3d'}
                  className={`rc-chip${state.view === '3d' ? ' active' : ''}`}
                  onClick={() => actions.setView('3d')}
                >
                  Terrain 3D
                </button>
              </div>

              <div className="rc-section-label">Layer</div>
              <div className="rc-chip-row" role="tablist" aria-label="Map layer">
                {VIZ.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    role="tab"
                    aria-selected={viz === v.id}
                    className={`rc-chip${viz === v.id ? ' active' : ''}`}
                    onClick={() => setViz(v.id)}
                  >
                    {v.label}
                  </button>
                ))}
              </div>

              {state.view === '2d' ? (
                <label className="field rc-opacity">
                  Overlay strength
                  <input
                    type="range"
                    min={0.25}
                    max={1}
                    step={0.05}
                    value={state.layerOpacity}
                    onChange={(e) => actions.setOpacity(Number(e.target.value))}
                  />
                  <span>{Math.round(state.layerOpacity * 100)}%</span>
                </label>
              ) : (
                <label className="field rc-opacity">
                  Height stretch
                  <input
                    type="range"
                    min={1}
                    max={30}
                    step={1}
                    value={heightStretch}
                    onChange={(e) => setHeightStretch(Number(e.target.value))}
                  />
                  <span>{heightStretch}×</span>
                </label>
              )}

              <div className="rc-divider" />

              <div className="rc-section-label">Rain storm</div>
              <label className="field">
                Rainfall
                <input
                  type="range"
                  min={5}
                  max={120}
                  step={1}
                  value={state.params.rainfallMm}
                  onChange={(e) => {
                    actions.setRainfall(Number(e.target.value));
                    if (viz === 'elevation') setViz('water');
                  }}
                />
                <span className="rc-range-val">{state.params.rainfallMm} mm</span>
              </label>
              <div className="rc-chip-row">
                {SCENARIOS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`rc-chip${state.params.rainfallMm === s.mm ? ' active' : ''}`}
                    onClick={() => {
                      actions.setRainfall(s.mm);
                      setViz('water');
                    }}
                  >
                    {s.label.replace(' Rain', '')}
                  </button>
                ))}
              </div>

              <label className="field">
                Soil
                <select
                  value={state.params.soil}
                  onChange={(e) => actions.setSoil(e.target.value as SoilType)}
                >
                  {(Object.keys(SOILS) as SoilType[]).map((k) => (
                    <option key={k} value={k}>
                      {SOILS[k].label}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}

          {state.sim && (
            <>
              <div className="rc-divider" />
              <div className="rc-section-label">
                Water on the field
                {state.simBusy ? ' · updating…' : ''}
              </div>
              <div className="rc-stat-grid">
                <div>
                  <strong>{fmtM3(state.sim.totals.rainfallVolumeM3)}</strong>
                  <span>Rainfall</span>
                </div>
                <div>
                  <strong>{fmtM3(state.sim.totals.runoffVolumeM3)}</strong>
                  <span>Runoff</span>
                </div>
                <div>
                  <strong>{fmtM3(state.sim.totals.storedInDepressionsM3)}</strong>
                  <span>Ponded</span>
                </div>
                <div>
                  <strong>{fmtM3(state.sim.totals.harvestPotentialM3)}</strong>
                  <span>Harvestable</span>
                </div>
              </div>

              {state.sim.candidates.length > 0 && (
                <>
                  <div className="rc-section-label">Best catch spots</div>
                  <ul className="rc-spots">
                    {state.sim.candidates.slice(0, 4).map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          className={state.selection.candidateId === c.id ? 'active' : ''}
                          onClick={() => actions.selectCandidate(c.id)}
                        >
                          <span className="rc-spot-id">{c.id}</span>
                          <span className="rc-spot-meta">
                            {c.suitability.replace(' Candidate', '')} · {fmtM3(c.harvestM3)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  {selected && (
                    <p className="rc-spot-tip">{selected.recommendation}</p>
                  )}
                </>
              )}

              <button
                type="button"
                className="rc-more-toggle"
                onClick={() => setShowMore((v) => !v)}
              >
                {showMore ? 'Hide details' : 'More details'}
              </button>

              {showMore && (
                <div className="rc-more">
                  <p className="hint">{DEMO_DISCLAIMER}</p>
                  <dl className="rc-kv">
                    <div>
                      <dt>Leaves field</dt>
                      <dd>{fmtM3(state.sim.totals.leavingParcelM3)}</dd>
                    </div>
                    <div>
                      <dt>Runoff ratio</dt>
                      <dd>{state.sim.totals.runoffCoefficient.toFixed(2)}</dd>
                    </div>
                    <div>
                      <dt>Mean flood</dt>
                      <dd>{state.sim.totals.meanFlood.toFixed(0)}</dd>
                    </div>
                    <div>
                      <dt>Storm length</dt>
                      <dd>{state.params.durationH} h</dd>
                    </div>
                  </dl>
                  <button
                    className="ghost"
                    type="button"
                    disabled={state.simBusy}
                    onClick={() => void actions.compareScenarios()}
                  >
                    Compare storm sizes
                  </button>
                  {state.scenarios && (
                    <div className="rc-table-wrap">
                      <table className="rc-table">
                        <thead>
                          <tr>
                            <th>Rain</th>
                            <th>Runoff</th>
                            <th>Harvest</th>
                            <th>Risk</th>
                          </tr>
                        </thead>
                        <tbody>
                          {state.scenarios.map((s) => (
                            <tr key={s.label}>
                              <td>{s.rainfallMm} mm</td>
                              <td>{fmtM3(s.runoffM3)}</td>
                              <td>{fmtM3(s.harvestPotentialM3)}</td>
                              <td>{s.overallRisk}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {state.sim.alerts[0] && (
                    <p className="rc-alert-line">
                      {state.sim.alerts[0].title}: {state.sim.alerts[0].description}
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          {state.error && (
            <div className="rc-error" role="alert">
              <p>{state.error.message}</p>
              <p>{state.error.solution}</p>
              <button type="button" className="ghost" onClick={() => actions.dismissError()}>
                Dismiss
              </button>
            </div>
          )}
        </aside>
      )}

      {busy && (
        <div className="rc-busy-dock" aria-live="polite">
          <div className="rc-busy-bar">
            <div style={{ width: `${Math.max(10, state.progress * 100)}%` }} />
          </div>
          <span>{state.stage || 'Working…'}</span>
        </div>
      )}

      {!ready && !busy && site && (
        <div className="rc-empty-hint">
          <p>
            <strong>{site.name}</strong> is on the map.
          </p>
          <p>Press Explore your site to simulate drainage.</p>
        </div>
      )}
    </div>
  );
}
