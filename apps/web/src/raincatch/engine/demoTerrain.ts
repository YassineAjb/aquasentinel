import type { DemGrid, LatLngBoundsLiteral } from '../types';
import { M_PER_DEG_LAT, metersPerDegLon } from './grid';

/**
 * Synthetic LiDAR/DEM for demo / site exploration.
 * Deterministic (seeded). NOT a measurement.
 *
 * When a site polygon + bounds are provided, the grid is fitted to that footprint
 * and cells outside the polygon are masked (NaN) so hydrology follows the parcel.
 */

export const DEMO_CENTER = { lat: 36.8644, lon: 9.9736 };
export const DEMO_NAME = 'Green Valley Farm';
export const DEMO_DISCLAIMER =
  'SIMULATED TERRAIN — Synthetic LiDAR/DEM fitted to the site footprint. Not a real survey.';

/** GeoJSON ring: [lon, lat][] (first = last optional). */
export type LonLatRing = [number, number][];

export type DemoDemOptions = {
  name?: string;
  center?: { lat: number; lon: number };
  siteId?: string;
  /** Geographic bounds of the selected site (will be padded slightly). */
  bounds?: LatLngBoundsLiteral;
  /** Site boundary ring in [lon, lat] — cells outside become no-data. */
  polygon?: LonLatRing;
};

const DEFAULT_COLS = 134;
const DEFAULT_ROWS = 100;
const DEFAULT_CELL = 3; // metres

function hash2(ix: number, iy: number, seed: number): number {
  let h = (ix * 374761393 + iy * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

function valueNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0, seed);
  const b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed);
  const d = hash2(x0 + 1, y0 + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function distToPolyline(x: number, y: number, pts: [number, number][]): number {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / len2));
    const d = Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
    if (d < best) best = d;
  }
  return best;
}

const gauss = (d: number, sigma: number) => Math.exp(-(d * d) / (2 * sigma * sigma));

function seedFromId(id?: string): number {
  if (!id) return 7;
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 9973 || 7;
}

/** Ray-casting point-in-polygon. Ring is [lon, lat]. */
export function pointInRing(lon: number, lat: number, ring: LonLatRing): boolean {
  if (ring.length < 3) return true;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect =
      yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function ringBounds(ring: LonLatRing): LatLngBoundsLiteral | null {
  if (!ring.length) return null;
  let west = Infinity;
  let east = -Infinity;
  let south = Infinity;
  let north = -Infinity;
  for (const [lon, lat] of ring) {
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    west = Math.min(west, lon);
    east = Math.max(east, lon);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }
  if (!Number.isFinite(west) || east <= west || north <= south) return null;
  return { west, east, south, north };
}

function padBounds(b: LatLngBoundsLiteral, padFrac = 0.04): LatLngBoundsLiteral {
  const dLon = (b.east - b.west) * padFrac;
  const dLat = (b.north - b.south) * padFrac;
  return {
    west: b.west - dLon,
    east: b.east + dLon,
    south: b.south - dLat,
    north: b.north + dLat,
  };
}

/**
 * Synthetic relief in local metres (origin SW). Features scale with parcel size W×H.
 * Pattern is the classic demo valleys/depressions, stretched to the footprint.
 */
function syntheticElevation(x: number, y: number, W: number, H: number, seed: number): number {
  const sx = W / 402;
  const sy = H / 300;
  const u = x / W;
  const v = y / H;

  const valley1: [number, number][] = [
    [395, 5],
    [345, 55],
    [300, 118],
    [262, 150],
    [225, 180],
    [185, 205],
    [150, 218],
    [118, 240],
    [90, 258],
  ].map(([px, py]) => [px * sx, py * sy] as [number, number]);
  const valley2: [number, number][] = [
    [225, 0],
    [212, 60],
    [190, 118],
    [165, 170],
    [150, 218],
  ].map(([px, py]) => [px * sx, py * sy] as [number, number]);
  const pits: { x: number; y: number; depth: number; sigma: number }[] = [
    { x: 312 * sx, y: 62 * sy, depth: 1.3, sigma: 8 * Math.min(sx, sy) },
    { x: 96 * sx, y: 112 * sy, depth: 1.0, sigma: 8 * Math.min(sx, sy) },
    { x: 332 * sx, y: 205 * sy, depth: 1.6, sigma: 10 * Math.min(sx, sy) },
    { x: 182 * sx, y: 42 * sy, depth: 0.9, sigma: 7 * Math.min(sx, sy) },
    { x: 276 * sx, y: 126 * sy, depth: 1.5, sigma: 11 * Math.min(sx, sy) },
    { x: 58 * sx, y: 188 * sy, depth: 1.1, sigma: 8 * Math.min(sx, sy) },
    { x: 40 * sx, y: 32 * sy, depth: 0.15, sigma: 2.2 * Math.min(sx, sy) },
    { x: 372 * sx, y: 272 * sy, depth: 0.18, sigma: 2.4 * Math.min(sx, sy) },
  ];

  // Mild site-specific tilt so different fields don't look identical
  const tilt = ((seed % 17) - 8) * 0.08;

  let h = 100 + (9.5 + tilt) * u + (7.5 - tilt * 0.5) * (1 - v);
  h += 1.1 * Math.sin(u * 5.2 + 0.7 + seed * 0.01) * Math.cos(v * 3.6) + 0.6 * Math.sin(v * 9 + u * 2);

  h -= 2.3 * gauss(distToPolyline(x, y, valley1), 17 * Math.min(sx, sy));
  h -= 1.7 * gauss(distToPolyline(x, y, valley2), 13 * Math.min(sx, sy));

  h -= 2.4 * gauss(Math.hypot(x - 85 * sx, y - 262 * sy), 28 * Math.min(sx, sy));
  h +=
    1.1 *
    gauss(y - 288 * sy, 4.5 * sy) *
    (x < 175 * sx ? 1 : Math.max(0, 1 - (x - 175 * sx) / (40 * sx)));
  const bundL = 225 * sx;
  const bundR = 305 * sx;
  const inBund =
    x > bundL && x < bundR
      ? 1
      : x >= bundR
        ? Math.max(0, 1 - (x - bundR) / (15 * sx))
        : Math.max(0, 1 - (bundL - x) / (15 * sx));
  h += 1.0 * gauss(y - 150 * sy - (x - 265 * sx) * 0.08, 4 * sy) * inBund;

  for (const p of pits) h -= p.depth * gauss(Math.hypot(x - p.x, y - p.y), p.sigma);

  h += (valueNoise(x / 14, y / 14, seed) - 0.5) * 0.08 + (valueNoise(x / 5, y / 5, seed + 6) - 0.5) * 0.03;
  return h;
}

function fitGrid(bounds: LatLngBoundsLiteral): {
  cols: number;
  rows: number;
  cellSizeX: number;
  cellSizeY: number;
  widthM: number;
  heightM: number;
} {
  const midLat = (bounds.north + bounds.south) / 2;
  const widthM = Math.max(60, (bounds.east - bounds.west) * metersPerDegLon(midLat));
  const heightM = Math.max(60, (bounds.north - bounds.south) * M_PER_DEG_LAT);
  const maxDim = 180;
  let cell = 3;
  if (widthM / cell > maxDim || heightM / cell > maxDim) {
    cell = Math.max(3, Math.ceil(Math.max(widthM, heightM) / maxDim));
  }
  const cols = Math.max(20, Math.min(maxDim, Math.round(widthM / cell)));
  const rows = Math.max(20, Math.min(maxDim, Math.round(heightM / cell)));
  return {
    cols,
    rows,
    cellSizeX: widthM / cols,
    cellSizeY: heightM / rows,
    widthM,
    heightM,
  };
}

export function generateDemoDem(opts: DemoDemOptions = {}): DemGrid {
  const name = opts.name?.trim() || DEMO_NAME;
  const seed = seedFromId(opts.siteId);
  const ring = opts.polygon?.length ? opts.polygon : undefined;
  const fromRing = ring ? ringBounds(ring) : null;
  const rawBounds = opts.bounds ?? fromRing;
  const fitted = Boolean(rawBounds);

  let bounds: LatLngBoundsLiteral;
  let cols: number;
  let rows: number;
  let cellSizeX: number;
  let cellSizeY: number;
  let widthM: number;
  let heightM: number;

  if (rawBounds) {
    bounds = padBounds(rawBounds, 0.03);
    const g = fitGrid(bounds);
    cols = g.cols;
    rows = g.rows;
    cellSizeX = g.cellSizeX;
    cellSizeY = g.cellSizeY;
    widthM = g.widthM;
    heightM = g.heightM;
  } else {
    const center = opts.center ?? DEMO_CENTER;
    cols = DEFAULT_COLS;
    rows = DEFAULT_ROWS;
    cellSizeX = DEFAULT_CELL;
    cellSizeY = DEFAULT_CELL;
    widthM = cols * cellSizeX;
    heightM = rows * cellSizeY;
    const dLat = heightM / M_PER_DEG_LAT;
    const dLon = widthM / metersPerDegLon(center.lat);
    bounds = {
      south: center.lat - dLat / 2,
      north: center.lat + dLat / 2,
      west: center.lon - dLon / 2,
      east: center.lon + dLon / 2,
    };
  }

  const z = new Float32Array(cols * rows);
  let inside = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lon = bounds.west + ((c + 0.5) / cols) * (bounds.east - bounds.west);
      const lat = bounds.north - ((r + 0.5) / rows) * (bounds.north - bounds.south);
      if (ring && !pointInRing(lon, lat, ring)) {
        z[r * cols + c] = NaN;
        continue;
      }
      const x = (c + 0.5) * cellSizeX;
      const y = (r + 0.5) * cellSizeY;
      z[r * cols + c] = syntheticElevation(x, y, widthM, heightM, seed);
      inside++;
    }
  }

  // If mask wiped almost everything (bad CRS / tiny ring), fall back to full bbox fill
  if (ring && inside < Math.max(100, cols * rows * 0.05)) {
    for (let i = 0; i < z.length; i++) {
      const r = (i / cols) | 0;
      const c = i - r * cols;
      const x = (c + 0.5) * cellSizeX;
      const y = (r + 0.5) * cellSizeY;
      z[i] = syntheticElevation(x, y, widthM, heightM, seed);
    }
    inside = z.length;
  }

  return {
    id: opts.siteId ? `sim-site-${opts.siteId}` : 'demo-green-valley',
    name,
    source: 'demo',
    isDemo: true,
    kind: 'DTM',
    cols,
    rows,
    cellSizeX,
    cellSizeY,
    bounds,
    z,
    crs: 'EPSG:4326 (synthetic)',
    verticalErrorM: 0.1,
    notes: [
      DEMO_DISCLAIMER,
      fitted
        ? `Grid fitted to site footprint (~${(widthM / 1e2).toFixed(0)}×${(heightM / 1e2).toFixed(0)} dam, ${cols}×${rows} @ ~${((cellSizeX + cellSizeY) / 2).toFixed(1)} m). Relief is simulated; elevations are not measured.`
        : 'Location is illustrative only; the relief is generated by the application.',
      ring ? 'Cells outside the drawn site boundary are masked.' : '',
    ].filter(Boolean),
  };
}
