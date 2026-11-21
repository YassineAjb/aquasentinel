import type { DemGrid, LatLngBoundsLiteral } from '../types';

/** D8 neighbour offsets: E, SE, S, SW, W, NW, N, NE */
export const DR = [0, 1, 1, 1, 0, -1, -1, -1];
export const DC = [1, 1, 0, -1, -1, -1, 0, 1];

export const M_PER_DEG_LAT = 110574;
export const M_PER_DEG_LON_EQ = 111320;

export function metersPerDegLon(latDeg: number): number {
  return M_PER_DEG_LON_EQ * Math.cos((latDeg * Math.PI) / 180);
}

export function boundsAreaM2(b: LatLngBoundsLiteral): number {
  const midLat = (b.north + b.south) / 2;
  return (b.north - b.south) * M_PER_DEG_LAT * (b.east - b.west) * metersPerDegLon(midLat);
}

/** centre of cell (r,c) in lat/lon */
export function cellLatLon(
  b: LatLngBoundsLiteral,
  rows: number,
  cols: number,
  r: number,
  c: number,
): { lat: number; lon: number } {
  return {
    lat: b.north - ((r + 0.5) * (b.north - b.south)) / rows,
    lon: b.west + ((c + 0.5) * (b.east - b.west)) / cols,
  };
}

export function latLonToCell(
  b: LatLngBoundsLiteral,
  rows: number,
  cols: number,
  lat: number,
  lon: number,
): { r: number; c: number } | null {
  const r = Math.floor(((b.north - lat) / (b.north - b.south)) * rows);
  const c = Math.floor(((lon - b.west) / (b.east - b.west)) * cols);
  if (r < 0 || c < 0 || r >= rows || c >= cols) return null;
  return { r, c };
}

export function demCellSizeM(dem: Pick<DemGrid, 'cellSizeX' | 'cellSizeY'>): number {
  return Math.sqrt(dem.cellSizeX * dem.cellSizeY);
}

/** Minimal binary min-heap keyed by a float priority (used by priority-flood). */
export class MinHeap {
  private keys: number[] = [];
  private vals: number[] = [];
  get size(): number {
    return this.keys.length;
  }
  push(key: number, val: number): void {
    const k = this.keys;
    const v = this.vals;
    let i = k.length;
    k.push(key);
    v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p];
      v[i] = v[p];
      i = p;
    }
    k[i] = key;
    v[i] = val;
  }
  /** returns the value with the smallest key */
  pop(): number {
    const k = this.keys;
    const v = this.vals;
    const top = v[0];
    const lastK = k.pop() as number;
    const lastV = v.pop() as number;
    const n = k.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        if (r < n && k[r] < k[l]) l = r;
        if (k[l] >= lastK) break;
        k[i] = k[l];
        v[i] = v[l];
        i = l;
      }
      k[i] = lastK;
      v[i] = lastV;
    }
    return top;
  }
}

export function percentile(sorted: ArrayLike<number>, p: number): number {
  if (!sorted.length) return NaN;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
  return sorted[idx];
}

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function letterId(i: number): string {
  let s = '';
  let n = i;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}
