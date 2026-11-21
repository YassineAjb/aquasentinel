import { useSyncExternalStore } from 'react';
import { DEFAULT_CONFIG, DEFAULT_PARAMS, SCENARIOS } from './config';
import { engine } from './engineClient';
import type {
  DemSummary,
  LatLngBoundsLiteral,
  LayerId,
  RainCatchConfig,
  RainCatchError,
  RoutePlan,
  ScenarioSummary,
  SimulationParams,
  SimulationResult,
  SoilType,
  TerrainAnalysis,
} from './types';

export type Status = 'empty' | 'parsing' | 'parsed' | 'analyzing' | 'ready' | 'error';
export type Basemap = 'satellite' | 'streets' | 'plain';

export interface ImportInfo {
  fileName: string;
  format: string;
  sizeBytes: number;
  startedAt: number;
  finishedAt?: number;
}

export interface RainCatchState {
  summary: DemSummary | null;
  analysis: TerrainAnalysis | null;
  sim: SimulationResult | null;
  params: SimulationParams;
  config: RainCatchConfig;
  status: Status;
  stage: string;
  progress: number;
  error: RainCatchError | null;
  simBusy: boolean;
  importInfo: ImportInfo | null;
  selection: { cell: { r: number; c: number } | null; zoneId: string | null; candidateId: string | null };
  route: RoutePlan | null;
  scenarios: ScenarioSummary[] | null;
  layers: Record<LayerId, boolean>;
  layerOpacity: number;
  basemap: Basemap;
  view: '2d' | '3d';
  rainAnimation: boolean;
  lastSimulationAt: string | null;
  analysisCount: number;
}

const initial: RainCatchState = {
  summary: null,
  analysis: null,
  sim: null,
  params: DEFAULT_PARAMS,
  config: DEFAULT_CONFIG,
  status: 'empty',
  stage: '',
  progress: 0,
  error: null,
  simBusy: false,
  importInfo: null,
  selection: { cell: null, zoneId: null, candidateId: null },
  route: null,
  scenarios: null,
  layers: {
    elevation: true,
    slope: false,
    flowDirection: false,
    flowAccumulation: false,
    drainagePaths: true,
    waterAccumulation: true,
    floodSusceptibility: false,
    rainfall: false,
    harvestCandidates: true,
    agriSuitability: false,
  },
  layerOpacity: 0.75,
  basemap: 'satellite',
  view: '2d',
  rainAnimation: false,
  lastSimulationAt: null,
  analysisCount: 0,
};

let state: RainCatchState = initial;
const subs = new Set<() => void>();
const set = (patch: Partial<RainCatchState>) => {
  state = { ...state, ...patch };
  subs.forEach((f) => f());
};
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => subs.delete(f);
};

let simSeq = 0;
let simTimer: ReturnType<typeof setTimeout> | null = null;

async function runSimulate(): Promise<void> {
  const seq = ++simSeq;
  set({ simBusy: true });
  const res = await engine.request({ type: 'simulate', params: state.params, config: state.config });
  if (seq !== simSeq) return; // a newer simulation was requested meanwhile
  if (res.kind === 'simulation') {
    const keepCand = state.selection.candidateId && res.result.candidates.some((c) => c.id === state.selection.candidateId);
    set({
      sim: res.result,
      simBusy: false,
      error: null,
      lastSimulationAt: new Date().toISOString(),
      scenarios: null,
      selection: {
        ...state.selection,
        zoneId: state.selection.zoneId && res.result.zones.some((z) => z.id === state.selection.zoneId) ? state.selection.zoneId : null,
        candidateId: keepCand ? state.selection.candidateId : null,
      },
      route: keepCand ? state.route : null,
    });
    if (keepCand && state.selection.candidateId) void actions.planRoute(state.selection.candidateId);
  } else if (res.kind === 'error') set({ simBusy: false, error: res.error });
}

async function analyzeAndSimulate(): Promise<void> {
  set({ status: 'analyzing', stage: 'Analysing terrain', progress: 0.1, error: null });
  const a = await engine.request({ type: 'analyze', config: state.config }, (f, s) => set({ progress: 0.1 + 0.5 * f, stage: s }));
  if (a.kind !== 'analysis') {
    set({ status: 'error', error: a.kind === 'error' ? a.error : null });
    return;
  }
  set({ analysis: a.analysis, progress: 0.65, stage: 'Simulating rainfall', sim: null, route: null, scenarios: null });
  const s = await engine.request({ type: 'simulate', params: state.params, config: state.config });
  if (s.kind !== 'simulation') {
    set({ status: 'error', error: s.kind === 'error' ? s.error : null });
    return;
  }
  set({
    sim: s.result,
    status: 'ready',
    progress: 1,
    stage: 'Done',
    lastSimulationAt: new Date().toISOString(),
    analysisCount: state.analysisCount + 1,
    selection: { cell: null, zoneId: null, candidateId: null },
  });
}

export const actions = {
  /**
   * "Explore your site": synthetic LiDAR/DEM (optionally georeferenced to a site)
   * then full analyze + rainfall simulation.
   */
  async exploreSite(opts?: {
    name?: string;
    center?: { lat: number; lon: number };
    siteId?: string;
    soil?: SoilType;
    bounds?: LatLngBoundsLiteral;
    polygon?: [number, number][];
  }): Promise<void> {
    if (opts?.soil) set({ params: { ...state.params, soil: opts.soil } });
    set({
      status: 'parsing',
      stage: 'Fitting simulated terrain to site',
      progress: 0.1,
      error: null,
      importInfo: null,
    });
    const r = await engine.request(
      {
        type: 'loadDemo',
        name: opts?.name,
        center: opts?.center,
        siteId: opts?.siteId,
        bounds: opts?.bounds,
        polygon: opts?.polygon,
      },
      (f, s) => set({ progress: f, stage: s }),
    );
    if (r.kind !== 'dem') return set({ status: 'error', error: r.kind === 'error' ? r.error : null });
    set({ summary: r.summary, importInfo: null });
    await analyzeAndSimulate();
  },

  /** @deprecated use exploreSite */
  async loadDemo(): Promise<void> {
    return this.exploreSite();
  },

  /** "Analyze My Terrain" */
  async analyze(): Promise<void> {
    if (!state.summary) {
      return set({
        status: 'error',
        error: {
          code: 'DEM_MISSING',
          message: 'No terrain loaded.',
          solution: 'Choose a site and click "Explore your site" to run the simulation.',
        },
      });
    }
    await analyzeAndSimulate();
  },

  setRainfall(mm: number): void {
    if (!Number.isFinite(mm) || mm < 0) return;
    set({ params: { ...state.params, rainfallMm: Math.min(mm, 500) } });
    this.scheduleSim();
  },
  setSoil(soil: SoilType): void {
    set({ params: { ...state.params, soil } });
    this.scheduleSim();
  },
  setDuration(h: number): void {
    if (h > 0) set({ params: { ...state.params, durationH: h } });
  },
  setRunoffOverride(c: number | undefined): void {
    set({ params: { ...state.params, runoffCoefficientOverride: c } });
    this.scheduleSim();
  },
  scheduleSim(): void {
    if (!state.analysis) return;
    if (simTimer) clearTimeout(simTimer);
    simTimer = setTimeout(() => void runSimulate(), 120);
  },
  async updateConfig(patch: Partial<RainCatchConfig>): Promise<void> {
    set({ config: { ...state.config, ...patch } });
    if (state.analysis) await analyzeAndSimulate();
  },
  resetConfig(): Promise<void> {
    return this.updateConfig(DEFAULT_CONFIG);
  },

  selectCell(r: number, c: number): void {
    set({ selection: { ...state.selection, cell: { r, c } } });
  },
  selectZone(id: string | null): void {
    set({ selection: { ...state.selection, zoneId: id, candidateId: id ? null : state.selection.candidateId } });
  },
  selectCandidate(id: string | null): void {
    set({ selection: { ...state.selection, candidateId: id, zoneId: id ? null : state.selection.zoneId }, route: id ? state.route : null });
    if (id) void this.planRoute(id);
  },
  clearSelection(): void {
    set({ selection: { cell: null, zoneId: null, candidateId: null }, route: null });
  },
  async planRoute(candidateId: string): Promise<void> {
    const r = await engine.request({ type: 'route', candidateId });
    if (r.kind === 'route' && state.selection.candidateId === candidateId) set({ route: r.plan });
    else if (r.kind === 'error') set({ error: r.error });
  },
  async compareScenarios(): Promise<void> {
    if (!state.analysis) return;
    const r = await engine.request({
      type: 'compare',
      scenarios: SCENARIOS.map((s) => ({ label: s.label.replace(' Rain', ''), mm: s.id === 'moderate' ? 25 : s.mm })),
      params: state.params,
      config: state.config,
    });
    if (r.kind === 'compare') set({ scenarios: r.scenarios });
    else if (r.kind === 'error') set({ error: r.error });
  },

  toggleLayer(id: LayerId): void {
    set({ layers: { ...state.layers, [id]: !state.layers[id] } });
  },
  setLayers(patch: Partial<Record<LayerId, boolean>>): void {
    set({ layers: { ...state.layers, ...patch } });
  },
  setOpacity(v: number): void {
    set({ layerOpacity: v });
  },
  setBasemap(b: Basemap): void {
    set({ basemap: b });
  },
  setView(v: '2d' | '3d'): void {
    set({ view: v });
  },
  setRainAnimation(v: boolean): void {
    set({ rainAnimation: v });
  },
  dismissError(): void {
    set({ error: null, status: state.analysis ? 'ready' : state.summary ? 'parsed' : 'empty' });
  },
};

export function useRainCatch(): RainCatchState {
  return useSyncExternalStore(subscribe, () => state);
}
export const getState = () => state;
