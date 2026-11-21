import type { HarvestCandidate, RainCatchConfig, TerrainAnalysis, ZoningClass } from '../types';
import { ZONING_ORDER } from '../types';

const IDX = (z: ZoningClass) => ZONING_ORDER.indexOf(z) + 1;

/**
 * Agricultural zoning from relief + simulation. Priority (first match wins):
 * Protected → Water Accumulation → Water Harvesting → Potential Flood → High Runoff → Suitable.
 * It never proposes a crop: only compatibility with agricultural use from a water/relief standpoint.
 */
export function classifyZoning(
  a: TerrainAnalysis,
  zoneMap: Int16Array,
  floodScore: Float32Array,
  runoffMm: Float32Array,
  candidates: HarvestCandidate[],
  cfg: RainCatchConfig,
): Uint8Array {
  const out = new Uint8Array(a.n);
  const top = candidates.filter((c) => !c.blocked).slice(0, 3);
  const bufferM = (c: HarvestCandidate) => Math.sqrt(c.footprintM2 / Math.PI) + 15;
  const floodHigh = cfg.floodThresholds.moderate; // > this = High
  for (let r = 0; r < a.rows; r++) {
    for (let c = 0; c < a.cols; c++) {
      const i = r * a.cols + c;
      if (Number.isNaN(a.z[i])) continue;
      const slope = a.slope[i];
      const onCorridor = a.contribAreaM2[i] >= a.corridorThresholdM2;
      let cls: ZoningClass;
      if (slope >= 20 || (slope >= cfg.slopeClasses.steep && onCorridor)) cls = 'Protected Zone';
      else if (zoneMap[i] > 0) cls = 'Water Accumulation Zone';
      else if (
        top.some((t) => Math.hypot((t.r - r) * a.cellSizeY, (t.c - c) * a.cellSizeX) <= bufferM(t))
      )
        cls = 'Water Harvesting Zone';
      else if (floodScore[i] > floodHigh) cls = 'Potential Flood Zone';
      else if (slope >= cfg.slopeClasses.moderate || (onCorridor && slope >= 4) || runoffMm[i] > 0 && slope >= 6)
        cls = 'High Runoff Zone';
      else cls = 'Suitable Agricultural Zone';
      out[i] = IDX(cls);
    }
  }
  return out;
}
