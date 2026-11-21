import { SOILS } from '../config';
import type { RainCatchConfig, SimulationParams, TerrainAnalysis } from '../types';
import { clamp01 } from './grid';
import { accumulate } from './terrain';

export interface DepressionState {
  id: number;
  inflowM3: number;
  storedM3: number;
  overflowM3: number;
  fillRatio: number;
  /** water surface level reached (m) */
  levelZ: number;
}

export interface RainfallCore {
  runoffMm: Float32Array;
  flowM3: Float32Array;
  waterDepth: Float32Array;
  floodScore: Float32Array;
  depStates: Map<number, DepressionState>;
  rainfallVolumeM3: number;
  runoffVolumeM3: number;
  storedInDepressionsM3: number;
  leavingParcelM3: number;
}

/** SCS-CN runoff depth (mm) for rainfall P (mm) and curve number CN. */
export function scsRunoffMm(pMm: number, cn: number, lambda = 0.2): number {
  const s = 25400 / cn - 254;
  const ia = lambda * s;
  if (pMm <= ia) return 0;
  const q = ((pMm - ia) * (pMm - ia)) / (pMm - ia + s);
  return q > pMm ? pMm : q;
}

function slopeCnAdjustment(deg: number): number {
  return deg < 1 ? -2 : deg < 3 ? 0 : deg < 8 ? 2 : deg < 15 ? 4 : 6;
}

/**
 * Rainfall → runoff → routing → depression storage → flood susceptibility.
 *
 * ASSUMPTIONS (documented, configurable): uniform soil (user choice), SCS Curve Number runoff
 * adjusted by slope, steady routing along D8 paths (no travel time, no infiltration along the path,
 * no evaporation, depressions fill instantly). This is a topographic screening model, not a
 * hydraulic simulation.
 */
export function simulateCore(
  a: TerrainAnalysis,
  params: SimulationParams,
  cfg: RainCatchConfig,
): RainfallCore {
  const { n, cols, cellAreaM2: area } = a;
  const soil = SOILS[params.soil];
  const P = Math.max(0, params.rainfallMm);

  const runoffMm = new Float32Array(n).fill(NaN);
  const w = new Float32Array(n);
  let rainVol = 0;
  let runVol = 0;
  for (let i = 0; i < n; i++) {
    if (Number.isNaN(a.z[i])) continue;
    let q: number;
    if (params.runoffCoefficientOverride !== undefined) {
      q = P * clamp01(params.runoffCoefficientOverride);
    } else {
      const cn = Math.min(98, Math.max(30, soil.cn + slopeCnAdjustment(a.slope[i])));
      q = scsRunoffMm(P, cn, cfg.initialAbstractionRatio);
    }
    runoffMm[i] = q;
    w[i] = (q / 1000) * area;
    rainVol += (P / 1000) * area;
    runVol += w[i];
  }

  // depressions that are allowed to store water (artefacts are ignored in routing)
  const outletToDep = new Map<number, number>();
  const depById = new Map<number, (typeof a.depressions)[number]>();
  for (const d of a.depressions) {
    depById.set(d.id, d);
    if (!d.likelyArtifact) outletToDep.set(d.outletIdx, d.id);
  }
  const depStates = new Map<number, DepressionState>();
  let stored = 0;
  const flow = accumulate(a.order, a.flowDir, cols, w, (i, inflow) => {
    const id = outletToDep.get(i);
    if (id === undefined) return inflow;
    const d = depById.get(id)!;
    const s = Math.min(inflow, d.volumeM3);
    stored += s;
    depStates.set(id, {
      id,
      inflowM3: inflow,
      storedM3: s,
      overflowM3: inflow - s,
      fillRatio: d.volumeM3 > 0 ? inflow / d.volumeM3 : 0,
      levelZ: d.minZ,
    });
    return inflow - s;
  });
  let leaving = 0;
  for (let i = 0; i < n; i++) if (a.flowDir[i] === -1) leaving += flow[i];
  const flowM3 = Float32Array.from(flow);

  // ponded depth: hypsometric fill of each storing depression
  const cellsByDep = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const id = a.depId[i];
    if (id > 0 && depStates.has(id)) {
      let arr = cellsByDep.get(id);
      if (!arr) cellsByDep.set(id, (arr = []));
      arr.push(i);
    }
  }
  const waterDepth = new Float32Array(n);
  for (const [id, cells] of cellsByDep) {
    const st = depStates.get(id)!;
    const d = depById.get(id)!;
    cells.sort((x, y) => a.z[x] - a.z[y]);
    let level = a.z[cells[0]];
    let cum = 0; // Σ area*(level - z_j) accumulated incrementally
    for (let k = 0; k < cells.length; k++) {
      const zk = a.z[cells[k]];
      const zNext = k + 1 < cells.length ? a.z[cells[k + 1]] : d.spillZ;
      const k1 = k + 1;
      // volume needed to raise from zk to zNext with k1 wet cells
      const vol = k1 * area * (Math.min(zNext, d.spillZ) - zk) + 0;
      // `cum` holds volume already stored below zk
      if (cum + vol >= st.storedM3 || k === cells.length - 1) {
        level = zk + Math.max(0, st.storedM3 - cum) / (k1 * area);
        break;
      }
      cum += vol;
      level = zNext;
    }
    level = Math.min(level, d.spillZ);
    st.levelZ = level;
    for (const i of cells) {
      const wd = level - a.z[i];
      if (wd > 0.005) waterDepth[i] = wd;
    }
  }

  const floodScore = computeFloodScore(a, runoffMm, waterDepth, cfg);
  return {
    runoffMm,
    flowM3,
    waterDepth,
    floodScore,
    depStates,
    rainfallVolumeM3: rainVol,
    runoffVolumeM3: runVol,
    storedInDepressionsM3: stored,
    leavingParcelM3: leaving,
  };
}

/** Flood SUSCEPTIBILITY score 0-100 (topographic screening — NOT a flood prediction). */
export function computeFloodScore(
  a: TerrainAnalysis,
  runoffMm: Float32Array,
  waterDepth: Float32Array,
  cfg: RainCatchConfig,
): Float32Array {
  const wts = cfg.floodWeights;
  const sum =
    wts.relativeElevation + wts.slope + wts.flowAccumulation + wts.corridorDistance + wts.depression + wts.rainfall || 1;
  const out = new Float32Array(a.n).fill(NaN);
  const zr = a.elevation.relief || 1;
  const denom = Math.log10(1 + a.validCells);
  for (let i = 0; i < a.n; i++) {
    if (Number.isNaN(a.z[i])) continue;
    const fRel = 1 - clamp01((a.z[i] - a.elevation.min) / zr);
    const fSlope = 1 - clamp01(a.slope[i] / 10);
    const fAcc = clamp01(Math.log10(1 + a.contribAreaM2[i] / a.cellAreaM2) / denom);
    const fDist = Math.exp(-a.corridorDistM[i] / 40);
    const fDep = clamp01(a.depth[i] / 1.0);
    const fRain = clamp01(runoffMm[i] / 50);
    const raw =
      (wts.relativeElevation * fRel +
        wts.slope * fSlope +
        wts.flowAccumulation * fAcc +
        wts.corridorDistance * fDist +
        wts.depression * fDep +
        wts.rainfall * fRain) /
      sum;
    // fixed contrast stretch so that the 0-100 scale is used (raw averages of 0-1 factors cluster mid-range)
    let s = 100 * clamp01((raw - 0.12) / 0.6);
    if (waterDepth[i] > 0) s = Math.max(s, 70 + 30 * clamp01(waterDepth[i] / 1.0));
    out[i] = s;
  }
  return out;
}
