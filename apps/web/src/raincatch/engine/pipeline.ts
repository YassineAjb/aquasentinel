import { DEFAULT_CONFIG } from '../config';
import type {
  DemGrid,
  DemSummary,
  FloodClass,
  RainCatchConfig,
  RiskLevel,
  SimulationParams,
  SimulationResult,
  TerrainAnalysis,
  ZoningClass,
} from '../types';
import { ZONING_ORDER } from '../types';
import { buildAlerts } from './alerts';
import { boundsAreaM2 } from './grid';
import { findHarvestCandidates } from './harvest';
import { SOILS } from '../config';
import { candidateRecommendation, zoneRecommendation } from './recommend';
import { simulateCore } from './rainfall';
import { buildCorridors } from './route';
import { analyzeTerrain } from './terrain';
import { buildZones } from './zones';
import { classifyZoning } from './zoning';

export function classifyFlood(score: number, cfg: RainCatchConfig): FloodClass {
  const t = cfg.floodThresholds;
  return score <= t.veryLow ? 'Very Low' : score <= t.low ? 'Low' : score <= t.moderate ? 'Moderate' : score <= t.high ? 'High' : 'Very High';
}

export function summarizeDem(dem: DemGrid): DemSummary {
  let min = Infinity;
  let max = -Infinity;
  let nodata = 0;
  for (let i = 0; i < dem.z.length; i++) {
    const v = dem.z[i];
    if (Number.isNaN(v)) nodata++;
    else {
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  return {
    name: dem.name,
    source: dem.source,
    isDemo: dem.isDemo,
    kind: dem.kind,
    cols: dem.cols,
    rows: dem.rows,
    cellSizeM: Math.sqrt(dem.cellSizeX * dem.cellSizeY),
    crs: dem.crs,
    minZ: min,
    maxZ: max,
    areaM2: Math.max(boundsAreaM2(dem.bounds), 0),
    noDataPct: (nodata / dem.z.length) * 100,
    pointCount: dem.pointCount,
    resampled: dem.resampled,
    originalCellSizeM: dem.originalCellSizeM,
    bounds: dem.bounds,
    notes: dem.notes,
  };
}

/** Runs the whole rainfall-dependent chain. Pure function — usable in a worker, in Node tests or on the main thread. */
export function runSimulation(
  a: TerrainAnalysis,
  params: SimulationParams,
  cfg: RainCatchConfig = DEFAULT_CONFIG,
): SimulationResult {
  const t0 = performance.now();
  const core = simulateCore(a, params, cfg);
  const { zones, zoneMap } = buildZones(a, core, params, cfg);
  const candidates = findHarvestCandidates(a, core, params, cfg);
  for (const z of zones) z.recommendation = zoneRecommendation(z, params);
  for (const c of candidates) c.recommendation = candidateRecommendation(c, params);
  const zoning = classifyZoning(a, zoneMap, core.floodScore, core.runoffMm, candidates, cfg);
  const corridors = buildCorridors(a);

  const floodClassPct: Record<FloodClass, number> = { 'Very Low': 0, Low: 0, Moderate: 0, High: 0, 'Very High': 0 };
  const zoningPct = Object.fromEntries(ZONING_ORDER.map((z) => [z, 0])) as Record<ZoningClass, number>;
  let sumFlood = 0;
  for (let i = 0; i < a.n; i++) {
    if (Number.isNaN(a.z[i])) continue;
    floodClassPct[classifyFlood(core.floodScore[i], cfg)]++;
    sumFlood += core.floodScore[i];
    if (zoning[i]) zoningPct[ZONING_ORDER[zoning[i] - 1]]++;
  }
  const nv = a.validCells || 1;
  (Object.keys(floodClassPct) as FloodClass[]).forEach((k) => (floodClassPct[k] = (floodClassPct[k] / nv) * 100));
  (Object.keys(zoningPct) as ZoningClass[]).forEach((k) => (zoningPct[k] = (zoningPct[k] / nv) * 100));
  const riskCount: Record<RiskLevel, number> = { Low: 0, Moderate: 0, High: 0, Critical: 0 };
  for (const z of zones) if (!z.likelyArtifact) riskCount[z.risk]++;

  const harvestPotential = candidates.filter((c) => !c.blocked).slice(0, 3).reduce((s, c) => s + c.harvestM3, 0);
  const draft: Omit<SimulationResult, 'alerts'> = {
    params,
    demId: a.demId,
    runoffMm: core.runoffMm,
    flowM3: core.flowM3,
    waterDepth: core.waterDepth,
    floodScore: core.floodScore,
    zoneMap,
    zoning,
    zones,
    candidates,
    corridors,
    totals: {
      rainfallVolumeM3: core.rainfallVolumeM3,
      runoffVolumeM3: core.runoffVolumeM3,
      infiltrationVolumeM3: core.rainfallVolumeM3 - core.runoffVolumeM3,
      runoffCoefficient: core.rainfallVolumeM3 > 0 ? core.runoffVolumeM3 / core.rainfallVolumeM3 : 0,
      storedInDepressionsM3: core.storedInDepressionsM3,
      leavingParcelM3: core.leavingParcelM3,
      meanFlood: sumFlood / nv,
      floodClassPct,
      zoningPct,
      riskCount,
      harvestPotentialM3: harvestPotential,
      infiltrationMmPerH: SOILS[params.soil].infiltrationMmH,
    },
    computeMs: 0,
  };
  const alerts = buildAlerts(a, draft);
  return { ...draft, alerts, computeMs: performance.now() - t0 };
}

/** Stateful helper (cache of the rain-independent analysis). Used by the worker. */
export class EngineSession {
  dem: DemGrid | null = null;
  analysis: TerrainAnalysis | null = null;

  setDem(dem: DemGrid): void {
    this.dem = dem;
    this.analysis = null;
  }
  analyze(cfg: RainCatchConfig): TerrainAnalysis {
    if (!this.dem) throw new Error('No terrain loaded.');
    this.analysis = analyzeTerrain(this.dem, cfg);
    return this.analysis;
  }
  simulate(params: SimulationParams, cfg: RainCatchConfig): SimulationResult {
    if (!this.analysis) throw new Error('Run the terrain analysis first.');
    return runSimulation(this.analysis, params, cfg);
  }
}
