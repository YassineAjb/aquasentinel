import type { AccumulationZone, RainCatchConfig, RiskLevel, SimulationParams, TerrainAnalysis } from '../types';
import { cellLatLon, clamp01, letterId } from './grid';
import type { RainfallCore } from './rainfall';

export function classifyRisk(score: number, cfg: RainCatchConfig): RiskLevel {
  const t = cfg.riskThresholds;
  return score < t.low ? 'Low' : score < t.moderate ? 'Moderate' : score < t.high ? 'High' : 'Critical';
}

/** Water accumulation zones = (a) non-artefact depressions + (b) convergence zones (flat + concentrated flow). */
export function buildZones(
  a: TerrainAnalysis,
  core: RainfallCore,
  params: SimulationParams,
  cfg: RainCatchConfig,
): { zones: AccumulationZone[]; zoneMap: Int16Array } {
  const { n, cols, rows } = a;
  const denom = Math.log10(1 + a.validCells);
  // rainfall factor: risk must fall to ~Low when the event produces (almost) no runoff
  const meanRunoffMm = (core.runoffVolumeM3 / Math.max(a.areaM2, 1)) * 1000;
  const rf = 0.15 + 0.85 * clamp01(meanRunoffMm / 25);
  const zonesRaw: Omit<AccumulationZone, 'id' | 'recommendation'>[] = [];
  const cellsOfZone: number[][] = [];

  const meanOf = (cells: number[], arr: Float32Array) => {
    let s = 0;
    for (const i of cells) s += arr[i];
    return s / cells.length;
  };

  // (a) depressions
  const cellsByDep = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const id = a.depId[i];
    if (id > 0) {
      let arr = cellsByDep.get(id);
      if (!arr) cellsByDep.set(id, (arr = []));
      arr.push(i);
    }
  }
  for (const d of a.depressions) {
    const cells = cellsByDep.get(d.id);
    if (!cells) continue;
    const st = core.depStates.get(d.id);
    const inflow = st?.inflowM3 ?? 0;
    const stored = st?.storedM3 ?? 0;
    const fill = d.volumeM3 > 0 ? inflow / d.volumeM3 : 0;
    const meanFlood = meanOf(cells, core.floodScore);
    const accN = clamp01(Math.log10(1 + d.contributingAreaM2 / a.cellAreaM2) / denom);
    let riskScore = 100 * (0.4 * clamp01(fill / 1.5) + 0.3 * (meanFlood / 100) + 0.3 * accN) * rf;
    // a depression that is probably a data artefact should never alarm the user
    if (d.likelyArtifact) riskScore = Math.min(riskScore, cfg.riskThresholds.low - 1);
    const reasons: string[] = [];
    reasons.push(`Closed topographic depression, max depth ${d.maxDepthM.toFixed(2)} m, ~${Math.round(d.areaM2)} m².`);
    reasons.push(
      `Receives ~${inflow.toFixed(1)} m³ for ${params.rainfallMm} mm of rain vs a topographic capacity of ${d.volumeM3.toFixed(1)} m³ (fill ratio ${(fill * 100).toFixed(0)} %).`,
    );
    if (fill > 1) reasons.push(`Capacity exceeded: ~${(inflow - stored).toFixed(1)} m³ would spill downstream.`);
    reasons.push(`Upstream contributing area ≈ ${Math.round(d.contributingAreaM2)} m².`);
    if (d.likelyArtifact) reasons.push(d.note);
    zonesRaw.push({
      kind: 'depression',
      depressionId: d.id,
      cells: cells.length,
      areaM2: d.areaM2,
      meanElevation: meanOf(cells, a.z),
      minElevation: d.minZ,
      depthM: d.maxDepthM,
      contributingAreaM2: d.contributingAreaM2,
      inflowM3: inflow,
      capacityM3: d.volumeM3,
      storedM3: stored,
      overflowM3: Math.max(0, inflow - stored),
      fillRatio: fill,
      meanFlood,
      rainfallMm: params.rainfallMm,
      riskScore,
      risk: classifyRisk(riskScore, cfg),
      confidence: d.confidence,
      likelyArtifact: d.likelyArtifact,
      centroid: d.centroid,
      reasons,
    });
    cellsOfZone.push(cells);
  }

  // (b) convergence zones: concentrated flow on gentle slopes, outside depressions
  const seen = new Uint8Array(n);
  const stack: number[] = [];
  const isConv = (i: number) =>
    !Number.isNaN(a.z[i]) &&
    a.depId[i] === 0 &&
    a.contribAreaM2[i] >= a.corridorThresholdM2 &&
    a.slope[i] < cfg.slopeClasses.gentle;
  for (let s = 0; s < n; s++) {
    if (seen[s] || !isConv(s)) continue;
    stack.length = 0;
    stack.push(s);
    seen[s] = 1;
    const cells: number[] = [];
    while (stack.length) {
      const i = stack.pop() as number;
      cells.push(i);
      const r = (i / cols) | 0;
      const c = i - r * cols;
      // radius-2 connectivity merges fragments of the same flat valley floor
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const rr = r + dr;
          const cc = c + dc;
          if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue;
          const j = rr * cols + cc;
          if (!seen[j] && isConv(j)) {
            seen[j] = 1;
            stack.push(j);
          }
        }
      }
    }
    if (cells.length < 12) continue;
    let sr = 0;
    let sc = 0;
    let maxContrib = 0;
    let maxFlow = 0;
    let minZ = Infinity;
    for (const i of cells) {
      const r = (i / cols) | 0;
      sr += r;
      sc += i - r * cols;
      if (a.contribAreaM2[i] > maxContrib) maxContrib = a.contribAreaM2[i];
      if (core.flowM3[i] > maxFlow) maxFlow = core.flowM3[i];
      if (a.z[i] < minZ) minZ = a.z[i];
    }
    const cr = Math.round(sr / cells.length);
    const cc = Math.round(sc / cells.length);
    const { lat, lon } = cellLatLon(a.bounds, rows, cols, cr, cc);
    const meanFlood = meanOf(cells, core.floodScore);
    const accN = clamp01(Math.log10(1 + maxContrib / a.cellAreaM2) / denom);
    const riskScore = 100 * (0.5 * (meanFlood / 100) + 0.3 * accN + 0.2) * rf;
    zonesRaw.push({
      kind: 'convergence',
      cells: cells.length,
      areaM2: cells.length * a.cellAreaM2,
      meanElevation: meanOf(cells, a.z),
      minElevation: minZ,
      depthM: 0,
      contributingAreaM2: maxContrib,
      inflowM3: maxFlow,
      capacityM3: 0,
      storedM3: 0,
      overflowM3: maxFlow,
      fillRatio: 0,
      meanFlood,
      rainfallMm: params.rainfallMm,
      riskScore,
      risk: classifyRisk(riskScore, cfg),
      confidence: a.cellSizeX <= 5 ? 'Medium' : 'Low',
      likelyArtifact: false,
      centroid: { lat, lon, r: cr, c: cc },
      reasons: [
        `Flow-convergence corridor on gentle terrain (slope < ${cfg.slopeClasses.gentle}°): water concentrates and slows down.`,
        `Contributing area ≈ ${Math.round(maxContrib)} m²; peak routed volume ≈ ${maxFlow.toFixed(1)} m³ for ${params.rainfallMm} mm.`,
        'Flow accumulation is a topographic indicator, not a measured water volume.',
      ],
    });
    cellsOfZone.push(cells);
  }

  // sort by risk and assign letters (Zone A = highest risk)
  const idx = zonesRaw.map((_, i) => i).sort((x, y) => zonesRaw[y].riskScore - zonesRaw[x].riskScore);
  const zones: AccumulationZone[] = [];
  const zoneMap = new Int16Array(n);
  idx.forEach((orig, rank) => {
    const z = zonesRaw[orig];
    zones.push({ ...z, id: letterId(rank), recommendation: '' });
    for (const i of cellsOfZone[orig]) zoneMap[i] = rank + 1;
  });
  return { zones, zoneMap };
}
