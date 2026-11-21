import type {
  DemGrid,
  Depression,
  ElevationStats,
  RainCatchConfig,
  SlopeStats,
  TerrainAnalysis,
} from '../types';
import { DC, DR, MinHeap, cellLatLon, percentile } from './grid';

/* ------------------------------------------------------------------ Elevation */

export function analyzeElevation(z: Float32Array, bins = 24): ElevationStats {
  const vals: number[] = [];
  for (let i = 0; i < z.length; i++) if (!Number.isNaN(z[i])) vals.push(z[i]);
  vals.sort((a, b) => a - b);
  const n = vals.length;
  let sum = 0;
  for (const v of vals) sum += v;
  const mean = sum / n;
  let sq = 0;
  for (const v of vals) sq += (v - mean) * (v - mean);
  const min = vals[0];
  const max = vals[n - 1];
  const step = (max - min) / bins || 1;
  const histogram = Array.from({ length: bins }, (_, i) => ({
    from: min + i * step,
    to: min + (i + 1) * step,
    count: 0,
  }));
  for (const v of vals) histogram[Math.min(bins - 1, Math.floor((v - min) / step))].count++;
  return {
    min,
    max,
    mean,
    std: Math.sqrt(sq / n),
    relief: max - min,
    p10: percentile(vals, 0.1),
    p90: percentile(vals, 0.9),
    histogram,
  };
}

/* ------------------------------------------------------------------ Slope (Horn 1981) + aspect + hillshade */

export function analyzeSlope(
  dem: DemGrid,
  cfg: RainCatchConfig,
): { slope: Float32Array; aspect: Float32Array; hillshade: Float32Array; stats: SlopeStats } {
  const { cols, rows, z, cellSizeX: dx, cellSizeY: dy } = dem;
  const slope = new Float32Array(cols * rows).fill(NaN);
  const aspect = new Float32Array(cols * rows).fill(-1);
  const hill = new Float32Array(cols * rows).fill(NaN);
  const az = (315 * Math.PI) / 180;
  const alt = (45 * Math.PI) / 180;
  const sc = cfg.slopeClasses;
  const cls = { Flat: 0, Gentle: 0, Moderate: 0, Steep: 0, 'Very Steep': 0 };
  const hist = Array.from({ length: 18 }, (_, i) => ({ from: i * 5, to: (i + 1) * 5, count: 0 }));
  let n = 0;
  let sumS = 0;
  let maxS = 0;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const zc = z[i];
      if (Number.isNaN(zc)) continue;
      const g = (rr: number, cc: number): number => {
        const R = rr < 0 ? 0 : rr >= rows ? rows - 1 : rr;
        const C = cc < 0 ? 0 : cc >= cols ? cols - 1 : cc;
        const v = z[R * cols + C];
        return Number.isNaN(v) ? zc : v;
      };
      const a = g(r - 1, c - 1), b = g(r - 1, c), cc2 = g(r - 1, c + 1);
      const d = g(r, c - 1), f = g(r, c + 1);
      const gg = g(r + 1, c - 1), h = g(r + 1, c), ii = g(r + 1, c + 1);
      // x increases east, y increases NORTH (row index increases south)
      const dzdx = (cc2 + 2 * f + ii - (a + 2 * d + gg)) / (8 * dx);
      const dzdy = (a + 2 * b + cc2 - (gg + 2 * h + ii)) / (8 * dy);
      const t = Math.hypot(dzdx, dzdy);
      const deg = (Math.atan(t) * 180) / Math.PI;
      slope[i] = deg;
      if (t > 1e-6) {
        // aspect = direction the slope FACES (downhill), degrees clockwise from north
        let asp = (Math.atan2(-dzdx, -dzdy) * 180) / Math.PI;
        if (asp < 0) asp += 360;
        aspect[i] = asp;
      }
      // light from azimuth 315° (NW), altitude 45°; normal = (-dz/dx, -dz/dy, 1) with x east, y north
      const norm = Math.sqrt(dzdx * dzdx + dzdy * dzdy + 1);
      const hs = (-dzdx * Math.sin(az) * Math.cos(alt) - dzdy * Math.cos(az) * Math.cos(alt) + Math.sin(alt)) / norm;
      hill[i] = hs < 0 ? 0 : hs > 1 ? 1 : hs;
      n++;
      sumS += deg;
      if (deg > maxS) maxS = deg;
      const k = deg < sc.flat ? 'Flat' : deg < sc.gentle ? 'Gentle' : deg < sc.moderate ? 'Moderate' : deg < sc.steep ? 'Steep' : 'Very Steep';
      cls[k]++;
      hist[Math.min(hist.length - 1, Math.floor(deg / 5))].count++;
    }
  }
  const pct = (v: number) => (n ? (v / n) * 100 : 0);
  return {
    slope,
    aspect,
    hillshade: hill,
    stats: {
      meanDeg: n ? sumS / n : 0,
      maxDeg: maxS,
      classPct: {
        Flat: pct(cls.Flat),
        Gentle: pct(cls.Gentle),
        Moderate: pct(cls.Moderate),
        Steep: pct(cls.Steep),
        'Very Steep': pct(cls['Very Steep']),
      },
      histogram: hist,
    },
  };
}

/* ------------------------------------------------------------------ Priority-Flood with epsilon (Barnes et al. 2014) */

const EPS = 1e-5;

/**
 * Fills depressions AND imposes a tiny gradient across flats, so that D8 is defined everywhere.
 * The ORIGINAL DEM is never modified: depth = filled − original is kept for depression analysis.
 */
export function priorityFlood(dem: DemGrid): Float64Array {
  const { cols, rows, z } = dem;
  const n = cols * rows;
  const filled = new Float64Array(n).fill(NaN);
  const closed = new Uint8Array(n);
  const heap = new MinHeap();

  const isValid = (i: number) => !Number.isNaN(z[i]);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (!isValid(i)) {
        closed[i] = 1;
        continue;
      }
      let seed = r === 0 || c === 0 || r === rows - 1 || c === cols - 1;
      if (!seed) {
        for (let k = 0; k < 8; k++) {
          if (!isValid((r + DR[k]) * cols + (c + DC[k]))) {
            seed = true;
            break;
          }
        }
      }
      if (seed) {
        closed[i] = 1;
        filled[i] = z[i];
        heap.push(z[i], i);
      }
    }
  }
  while (heap.size) {
    const i = heap.pop();
    const r = (i / cols) | 0;
    const c = i - r * cols;
    for (let k = 0; k < 8; k++) {
      const rr = r + DR[k];
      const cc = c + DC[k];
      if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue;
      const j = rr * cols + cc;
      if (closed[j]) continue;
      closed[j] = 1;
      const zj = z[j];
      const fj = zj <= filled[i] ? filled[i] + EPS : zj;
      filled[j] = fj;
      heap.push(fj, j);
    }
  }
  return filled;
}

/* ------------------------------------------------------------------ D8 flow direction + accumulation */

export function computeFlowDirection(dem: DemGrid, filled: Float64Array): Int8Array {
  const { cols, rows } = dem;
  const dir = new Int8Array(cols * rows).fill(-2);
  const dist = [dem.cellSizeX, Math.hypot(dem.cellSizeX, dem.cellSizeY), dem.cellSizeY, Math.hypot(dem.cellSizeX, dem.cellSizeY)];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (Number.isNaN(filled[i])) continue;
      let best = -1;
      let bestDrop = 0;
      for (let k = 0; k < 8; k++) {
        const rr = r + DR[k];
        const cc = c + DC[k];
        if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue;
        const f = filled[rr * cols + cc];
        if (Number.isNaN(f)) continue;
        const drop = (filled[i] - f) / dist[k & 3];
        if (drop > bestDrop) {
          bestDrop = drop;
          best = k;
        }
      }
      dir[i] = best; // -1 = outlet (no lower neighbour: drains out of the model)
    }
  }
  return dir;
}

export function computeOrder(filled: Float64Array): Uint32Array {
  const idx: number[] = [];
  for (let i = 0; i < filled.length; i++) if (!Number.isNaN(filled[i])) idx.push(i);
  const out = Uint32Array.from(idx);
  out.sort((a, b) => filled[b] - filled[a]);
  return out;
}

export function downstreamIndex(i: number, dir: number, cols: number): number {
  const r = (i / cols) | 0;
  const c = i - r * cols;
  return (r + DR[dir]) * cols + (c + DC[dir]);
}

/** Generic weighted accumulation (weights in any unit; returns same unit). Optional storage hook per cell. */
export function accumulate(
  order: Uint32Array,
  flowDir: Int8Array,
  cols: number,
  weights: Float32Array | Float64Array,
  onCell?: (i: number, inflow: number) => number,
): Float64Array {
  const acc = new Float64Array(weights.length);
  for (let i = 0; i < weights.length; i++) acc[i] = weights[i];
  for (let k = 0; k < order.length; k++) {
    const i = order[k];
    if (onCell) acc[i] = onCell(i, acc[i]);
    const d = flowDir[i];
    if (d >= 0) acc[downstreamIndex(i, d, cols)] += acc[i];
  }
  return acc;
}

/* ------------------------------------------------------------------ Depressions */

export function detectDepressions(
  dem: DemGrid,
  filled: Float64Array,
  contribAreaM2: Float32Array,
  cfg: RainCatchConfig,
): { depth: Float32Array; depId: Int32Array; depressions: Depression[] } {
  const { cols, rows, z } = dem;
  const n = cols * rows;
  const cellArea = dem.cellSizeX * dem.cellSizeY;
  const depth = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (Number.isNaN(z[i])) continue;
    const d = filled[i] - z[i];
    depth[i] = d > cfg.minDepressionDepthM ? d : 0;
  }
  const depId = new Int32Array(n);
  const depressions: Depression[] = [];
  const stack: number[] = [];
  let nextId = 1;
  for (let s = 0; s < n; s++) {
    if (depth[s] <= 0 || depId[s]) continue;
    const id = nextId++;
    stack.length = 0;
    stack.push(s);
    depId[s] = id;
    const cells: number[] = [];
    while (stack.length) {
      const i = stack.pop() as number;
      cells.push(i);
      const r = (i / cols) | 0;
      const c = i - r * cols;
      for (let k = 0; k < 8; k++) {
        const rr = r + DR[k];
        const cc = c + DC[k];
        if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue;
        const j = rr * cols + cc;
        if (depth[j] > 0 && !depId[j]) {
          depId[j] = id;
          stack.push(j);
        }
      }
    }
    let maxDepth = 0;
    let sumDepth = 0;
    let vol = 0;
    let minZ = Infinity;
    let spill = -Infinity;
    let outlet = cells[0];
    let outletF = Infinity;
    let sr = 0;
    let sc = 0;
    let edge = false;
    let maxContrib = 0;
    for (const i of cells) {
      const d = depth[i];
      if (d > maxDepth) maxDepth = d;
      sumDepth += d;
      vol += d * cellArea;
      if (z[i] < minZ) minZ = z[i];
      if (filled[i] > spill) spill = filled[i];
      if (filled[i] < outletF) {
        outletF = filled[i];
        outlet = i;
      }
      const r = (i / cols) | 0;
      const c = i - r * cols;
      sr += r;
      sc += c;
      if (r === 0 || c === 0 || r === rows - 1 || c === cols - 1) edge = true;
      if (contribAreaM2[i] > maxContrib) maxContrib = contribAreaM2[i];
    }
    const k = cells.length;
    const cr = Math.round(sr / k);
    const cc = Math.round(sc / k);
    const { lat, lon } = cellLatLon(dem.bounds, rows, cols, cr, cc);
    const vErr = dem.verticalErrorM;
    const area = k * cellArea;
    const tiny = k < 4;
    const shallow = maxDepth < 2 * vErr;
    const likelyArtifact = tiny || shallow;
    const ownArea = area;
    const receives = maxContrib > ownArea * 1.5;
    let confidence: Depression['confidence'] = 'High';
    let note = 'Relief well above the DEM vertical error: probably a real topographic depression.';
    if (likelyArtifact) {
      confidence = 'Low';
      note = shallow
        ? `Depth (${maxDepth.toFixed(2)} m) is within about 2× the assumed vertical error (${vErr} m): likely a DEM artefact — verify on site.`
        : 'Only a few cells: likely a data artefact (noise, vegetation return, interpolation).';
    } else if (edge || maxDepth < 3 * vErr || k < 12) {
      confidence = 'Medium';
      note = edge
        ? 'Touches the edge of the data: the true extent is unknown (the depression may extend outside the DEM).'
        : 'Moderate relief or small area: validate with a field survey.';
    }
    depressions.push({
      id,
      cells: k,
      areaM2: area,
      maxDepthM: maxDepth,
      meanDepthM: sumDepth / k,
      volumeM3: vol,
      minZ,
      spillZ: spill,
      outletIdx: outlet,
      centroid: { lat, lon, r: cr, c: cc },
      touchesEdge: edge,
      likelyArtifact,
      confidence,
      contributingAreaM2: maxContrib,
      receivesUpstreamFlow: receives,
      note,
    });
  }
  return { depth, depId, depressions };
}

/* ------------------------------------------------------------------ distance to corridors (chamfer, metres) */

export function distanceToMask(dem: DemGrid, mask: Uint8Array): Float32Array {
  const { cols, rows } = dem;
  const n = cols * rows;
  const dx = dem.cellSizeX;
  const dy = dem.cellSizeY;
  const dd = Math.hypot(dx, dy);
  const out = new Float32Array(n).fill(1e9);
  for (let i = 0; i < n; i++) if (mask[i]) out[i] = 0;
  const relax = (i: number, j: number, w: number) => {
    const v = out[j] + w;
    if (v < out[i]) out[i] = v;
  };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (c > 0) relax(i, i - 1, dx);
      if (r > 0) {
        relax(i, i - cols, dy);
        if (c > 0) relax(i, i - cols - 1, dd);
        if (c < cols - 1) relax(i, i - cols + 1, dd);
      }
    }
  }
  for (let r = rows - 1; r >= 0; r--) {
    for (let c = cols - 1; c >= 0; c--) {
      const i = r * cols + c;
      if (c < cols - 1) relax(i, i + 1, dx);
      if (r < rows - 1) {
        relax(i, i + cols, dy);
        if (c < cols - 1) relax(i, i + cols + 1, dd);
        if (c > 0) relax(i, i + cols - 1, dd);
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------ full terrain pipeline */

export function analyzeTerrain(dem: DemGrid, cfg: RainCatchConfig): TerrainAnalysis {
  const t0 = performance.now();
  const { cols, rows, z } = dem;
  const n = cols * rows;
  const cellArea = dem.cellSizeX * dem.cellSizeY;
  let valid = 0;
  for (let i = 0; i < n; i++) if (!Number.isNaN(z[i])) valid++;

  const elevation = analyzeElevation(z);
  const { slope, aspect, hillshade, stats: slopeStats } = analyzeSlope(dem, cfg);
  const filled = priorityFlood(dem);
  const flowDir = computeFlowDirection(dem, filled);
  const order = computeOrder(filled);

  const ones = new Float32Array(n);
  for (let i = 0; i < n; i++) ones[i] = Number.isNaN(z[i]) ? 0 : cellArea;
  const contribD = accumulate(order, flowDir, cols, ones);
  const contribAreaM2 = Float32Array.from(contribD);
  let maxContrib = 0;
  for (let i = 0; i < n; i++) if (contribAreaM2[i] > maxContrib) maxContrib = contribAreaM2[i];

  const { depth, depId, depressions } = detectDepressions(dem, filled, contribAreaM2, cfg);

  const areaM2 = valid * cellArea;
  const corridorThresholdM2 = Math.max(cellArea * 20, (cfg.drainageThresholdPct / 100) * areaM2);
  const corridorMask = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (contribAreaM2[i] >= corridorThresholdM2) corridorMask[i] = 1;
  const corridorDistM = distanceToMask(dem, corridorMask);

  const twi = new Float32Array(n).fill(NaN);
  const width = Math.sqrt(cellArea);
  for (let i = 0; i < n; i++) {
    if (Number.isNaN(z[i])) continue;
    const tanB = Math.max(Math.tan((slope[i] * Math.PI) / 180), 0.001);
    twi[i] = Math.log(Math.max(contribAreaM2[i], cellArea) / width / tanB);
  }

  return {
    demId: dem.id,
    cols,
    rows,
    n,
    cellSizeX: dem.cellSizeX,
    cellSizeY: dem.cellSizeY,
    cellAreaM2: cellArea,
    areaM2,
    validCells: valid,
    bounds: dem.bounds,
    z,
    filled,
    depth,
    slope,
    aspect,
    hillshade,
    flowDir,
    contribAreaM2,
    order,
    twi,
    corridorDistM,
    corridorThresholdM2,
    depId,
    depressions,
    elevation,
    slopeStats,
    maxContribAreaM2: maxContrib,
    isDemo: dem.isDemo,
    computeMs: performance.now() - t0,
  };
}
