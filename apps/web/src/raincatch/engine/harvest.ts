import { SOILS } from '../config';
import type {
  HarvestCandidate,
  RainCatchConfig,
  RecommendationType,
  ScoreComponent,
  SimulationParams,
  SuitabilityClass,
  TerrainAnalysis,
} from '../types';
import { cellLatLon, clamp01, letterId } from './grid';
import type { RainfallCore } from './rainfall';

function edgeDistanceM(a: TerrainAnalysis, r: number, c: number): number {
  const dr = Math.min(r, a.rows - 1 - r) * a.cellSizeY;
  const dc = Math.min(c, a.cols - 1 - c) * a.cellSizeX;
  return Math.min(dr, dc);
}

function windowMean(arr: Float32Array | Float64Array, a: TerrainAnalysis, r: number, c: number, rad: number): number {
  let s = 0;
  let k = 0;
  for (let rr = Math.max(0, r - rad); rr <= Math.min(a.rows - 1, r + rad); rr++) {
    for (let cc = Math.max(0, c - rad); cc <= Math.min(a.cols - 1, c + rad); cc++) {
      const v = arr[rr * a.cols + cc];
      if (!Number.isNaN(v)) {
        s += v;
        k++;
      }
    }
  }
  return k ? s / k : NaN;
}

function slopeSuitability(deg: number): number {
  if (deg < 0.3) return 0.7;
  if (deg <= 5) return 1;
  if (deg >= 15) return 0;
  return 1 - (deg - 5) / 10;
}

export function classifySuitability(score: number, cfg: RainCatchConfig): SuitabilityClass {
  const t = cfg.harvestThresholds;
  return score >= t.excellent
    ? 'Excellent Candidate'
    : score >= t.good
      ? 'Good Candidate'
      : score >= t.moderate
        ? 'Moderate Candidate'
        : 'Poor Candidate';
}

interface Seed {
  r: number;
  c: number;
  kind: 'depression' | 'corridor';
  depressionId?: number;
}

/** Finds and scores candidate sites. Weights are user-adjustable assumptions, not scientific constants. */
export function findHarvestCandidates(
  a: TerrainAnalysis,
  core: RainfallCore,
  params: SimulationParams,
  cfg: RainCatchConfig,
): HarvestCandidate[] {
  const { cols, rows, n } = a;
  const seeds: Seed[] = [];

  // 1) natural depressions (excluding probable artefacts)
  const lowest = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const id = a.depId[i];
    if (id > 0 && (!lowest.has(id) || a.z[i] < a.z[lowest.get(id) as number])) lowest.set(id, i);
  }
  for (const d of a.depressions) {
    if (d.likelyArtifact || d.areaM2 < 60) continue;
    const i = lowest.get(d.id);
    if (i === undefined) continue;
    const r = (i / cols) | 0;
    seeds.push({ r, c: i - r * cols, kind: 'depression', depressionId: d.id });
  }

  // 2) corridor sites: concentrated flow on gentle slope, away from the outlet edge
  const minSpacingM = 50;
  const far = (r: number, c: number) =>
    seeds.every((s) => Math.hypot((s.r - r) * a.cellSizeY, (s.c - c) * a.cellSizeX) >= minSpacingM);
  const eligible: { i: number; pre: number }[] = [];
  for (let i = 0; i < n; i++) {
    if (Number.isNaN(a.z[i]) || a.depId[i] > 0) continue;
    if (a.contribAreaM2[i] < a.corridorThresholdM2 || a.slope[i] > 6) continue;
    const r = (i / cols) | 0;
    if (edgeDistanceM(a, r, i - r * cols) < 20) continue;
    eligible.push({ i, pre: Math.log10(a.contribAreaM2[i]) * slopeSuitability(a.slope[i]) });
  }
  eligible.sort((x, y) => y.pre - x.pre);
  let corridorCount = 0;
  for (const e of eligible) {
    if (corridorCount >= 4) break;
    const r = (e.i / cols) | 0;
    const c = e.i - r * cols;
    if (!far(r, c)) continue;
    seeds.push({ r, c, kind: 'corridor' });
    corridorCount++;
  }

  const soil = SOILS[params.soil];
  const w = cfg.harvestWeights;
  const wSum = w.flowAccumulation + w.depression + w.slope + w.catchment + w.soil + w.accessibility || 1;
  const denomCells = Math.log10(1 + a.validCells);
  const minSide = Math.min(rows * a.cellSizeY, cols * a.cellSizeX);
  const rad = Math.max(1, Math.round(15 / Math.sqrt(a.cellAreaM2)));
  const lossFactor = 1 - cfg.storageLossPct / 100;

  const out: Omit<HarvestCandidate, 'id' | 'rank'>[] = [];
  for (const s of seeds) {
    const i = s.r * cols + s.c;
    const dep = s.depressionId ? a.depressions.find((d) => d.id === s.depressionId) : undefined;
    const st = s.depressionId ? core.depStates.get(s.depressionId) : undefined;
    const slopeDeg = windowMean(a.slope, a, s.r, s.c, 2);
    const catchment = dep ? dep.contributingAreaM2 : a.contribAreaM2[i];
    const footprint = dep ? dep.areaM2 : cfg.defaultFootprintM2;
    const capacity = dep ? dep.volumeM3 : footprint * cfg.designDepthM * 0.6;
    const inflow = dep ? (st?.inflowM3 ?? 0) : core.flowM3[i];
    const harvestable = inflow * lossFactor;
    const harvest = Math.min(capacity, harvestable);
    const overflow = Math.max(0, harvestable - capacity);
    const edgeD = edgeDistanceM(a, s.r, s.c);
    const conc = windowMean(a.z, a, s.r, s.c, rad) - a.z[i];
    const floodHere = dep ? windowMeanOfCells(core.floodScore, a, s.r, s.c, 1) : core.floodScore[i];

    const fAcc = clamp01(Math.log10(1 + catchment / a.cellAreaM2) / denomCells);
    const fDep = dep
      ? clamp01(0.6 * clamp01(dep.maxDepthM / 1.0) + 0.4 * clamp01(dep.volumeM3 / 500))
      : clamp01(conc / 1.0) * 0.7;
    const fSlope = slopeSuitability(slopeDeg);
    const fCatch = clamp01(Math.log10(1 + catchment) / Math.log10(1 + 0.5 * a.areaM2));
    const fSoil = soil.retention;
    const fAccess = clamp01(0.7 * (1 - clamp01(edgeD / (0.5 * minSide))) + 0.3 * fSlope);

    const components: ScoreComponent[] = [
      { key: 'flowAccumulation', label: 'Flow accumulation', value: fAcc, weight: w.flowAccumulation / wSum, note: `Contributing area ≈ ${Math.round(catchment)} m²` },
      { key: 'depression', label: 'Depression potential', value: fDep, weight: w.depression / wSum, note: dep ? `Natural depression, ${dep.maxDepthM.toFixed(2)} m deep, ${dep.volumeM3.toFixed(0)} m³` : `No closed depression: concavity ${conc.toFixed(2)} m (excavation would be required)` },
      { key: 'slope', label: 'Slope suitability', value: fSlope, weight: w.slope / wSum, note: `Mean slope around site ${slopeDeg.toFixed(1)}°` },
      { key: 'catchment', label: 'Catchment area', value: fCatch, weight: w.catchment / wSum, note: `${((catchment / a.areaM2) * 100).toFixed(0)} % of the analysed area drains here` },
      { key: 'soil', label: 'Soil suitability', value: fSoil, weight: w.soil / wSum, note: `Assumed soil: ${soil.label} (user parameter, not measured)` },
      { key: 'accessibility', label: 'Accessibility (proxy)', value: fAccess, weight: w.accessibility / wSum, note: `${Math.round(edgeD)} m from the parcel edge — proxy only, no road data` },
    ];
    const score = 100 * components.reduce((t, c) => t + c.value * c.weight, 0);

    // constraints & safety
    const constraints: string[] = [];
    let blocked = false;
    if (slopeDeg >= 15) {
      constraints.push(`Steep terrain (${slopeDeg.toFixed(0)}°): embankment stability risk.`);
      blocked = true;
    } else if (slopeDeg >= 8) constraints.push(`Moderate-to-steep slope (${slopeDeg.toFixed(0)}°): earthworks and erosion control needed.`);
    if (dep?.likelyArtifact) {
      constraints.push('Depression may be a DEM artefact.');
      blocked = true;
    }
    if (overflow > 0) constraints.push(`Overflow risk: ~${overflow.toFixed(0)} m³ would exceed the capacity for ${params.rainfallMm} mm — a spillway is mandatory.`);
    if (floodHere >= 80) constraints.push('Very high flood susceptibility around the site: safety review required before any structure.');
    if (soil.retention < 0.4) constraints.push('Permeable soil assumed: significant seepage losses, lining probably required.');
    if (edgeD < 20) constraints.push('Very close to the parcel boundary: neighbouring land and regulatory set-backs.');
    if (dep?.touchesEdge) constraints.push('Depression touches the edge of the DEM: its true extent is unknown.');
    if (catchment < 0.05 * a.areaM2) constraints.push('Small contributing area: limited inflow.');
    if (a.cellSizeX > 5) constraints.push(`Coarse DEM resolution (${a.cellSizeX.toFixed(1)} m): micro-topography not resolved.`);
    if (capacity > 0 && inflow > 0 && inflow / capacity < 0.1)
      constraints.push(`The ${params.rainfallMm} mm scenario fills only ${((inflow / capacity) * 100).toFixed(0)} % of the capacity: oversized for this event.`);
    if (!dep) constraints.push('Hypothetical excavated basin: volume is a design assumption, not terrain storage.');

    const missing = ['Soil infiltration test and geotechnical assessment', 'Land tenure, permits and neighbours downstream', 'Existing tracks, canals and buried networks'];
    if (a.isDemo) missing.unshift('A real LiDAR / DEM survey (current terrain is synthetic)');
    if (dep && dep.confidence !== 'High') missing.push('Field verification of the depression');

    let suitability = classifySuitability(score, cfg);
    if (blocked) suitability = 'Poor Candidate';

    let rec: RecommendationType;
    if (blocked) rec = 'Site not recommended';
    else if (suitability === 'Excellent Candidate' && capacity >= 1500) rec = 'Small farm reservoir';
    else if ((suitability === 'Excellent Candidate' || suitability === 'Good Candidate') && dep) rec = 'Possible water retention basin';
    else if (suitability === 'Excellent Candidate' || suitability === 'Good Candidate') rec = 'Runoff collection';
    else if (suitability === 'Moderate Candidate' && floodHere >= 61) rec = 'Drainage improvement';
    else if (suitability === 'Moderate Candidate' && capacity < 300) rec = 'Rainwater storage';
    else if (suitability === 'Moderate Candidate') rec = 'Soil water conservation';
    else rec = 'Monitoring recommended';

    const conf: HarvestCandidate['confidence'] =
      dep?.confidence === 'Low' || a.cellSizeX > 10 ? 'Low' : dep?.confidence === 'High' && a.cellSizeX <= 5 ? 'High' : 'Medium';

    const { lat, lon } = cellLatLon(a.bounds, rows, cols, s.r, s.c);
    out.push({
      kind: s.kind,
      depressionId: s.depressionId,
      r: s.r,
      c: s.c,
      lat,
      lon,
      elevation: a.z[i],
      slopeDeg,
      footprintM2: footprint,
      catchmentM2: catchment,
      capacityM3: capacity,
      inflowM3: inflow,
      harvestM3: harvest,
      overflowM3: overflow,
      fillRatio: capacity > 0 ? inflow / capacity : 0,
      score,
      suitability,
      components,
      constraints,
      missingInfo: missing,
      blocked,
      recommendationType: rec,
      recommendation: '',
      floodScore: floodHere,
      distanceToEdgeM: edgeD,
      confidence: conf,
    });
  }
  out.sort((x, y) => y.score - x.score);
  return out.map((c, k) => ({ ...c, id: letterId(k), rank: k + 1 }));
}

function windowMeanOfCells(arr: Float32Array, a: TerrainAnalysis, r: number, c: number, rad: number): number {
  let m = 0;
  for (let rr = Math.max(0, r - rad); rr <= Math.min(a.rows - 1, r + rad); rr++)
    for (let cc = Math.max(0, c - rad); cc <= Math.min(a.cols - 1, c + rad); cc++) {
      const v = arr[rr * a.cols + cc];
      if (!Number.isNaN(v) && v > m) m = v;
    }
  return m;
}
