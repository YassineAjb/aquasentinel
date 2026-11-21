import type { LatLngBoundsLiteral } from '../types';
import { M_PER_DEG_LAT, metersPerDegLon } from './grid';

export type CrsInfo =
  | { kind: 'geographic'; code: string }
  | { kind: 'utm'; code: string; zone: number; north: boolean }
  | { kind: 'webmercator'; code: string };

/** Supported: EPSG:4326 (WGS84 lon/lat), EPSG:326xx/327xx (WGS84 UTM), EPSG:3857. */
export function parseCrs(code: string | undefined | null): CrsInfo | null {
  if (!code) return null;
  const m = /(\d{4,6})/.exec(code);
  if (!m) return null;
  const n = Number(m[1]);
  if (n === 4326 || n === 4979) return { kind: 'geographic', code: 'EPSG:4326' };
  if (n === 3857 || n === 900913) return { kind: 'webmercator', code: 'EPSG:3857' };
  if (n >= 32601 && n <= 32660) return { kind: 'utm', code: `EPSG:${n}`, zone: n - 32600, north: true };
  if (n >= 32701 && n <= 32760) return { kind: 'utm', code: `EPSG:${n}`, zone: n - 32700, north: false };
  return null;
}

/** WGS84 UTM → lat/lon (Krüger series, accuracy well below 1 m). */
export function utmToLatLon(easting: number, northing: number, zone: number, north: boolean): { lat: number; lon: number } {
  const a = 6378137;
  const f = 1 / 298.257223563;
  const k0 = 0.9996;
  const n = f / (2 - f);
  const A = (a / (1 + n)) * (1 + n ** 2 / 4 + n ** 4 / 64);
  const beta = [
    n / 2 - (2 / 3) * n ** 2 + (37 / 96) * n ** 3,
    n ** 2 / 48 + n ** 3 / 15,
    (17 / 480) * n ** 3,
  ];
  const delta = [
    2 * n - (2 / 3) * n ** 2 - 2 * n ** 3,
    (7 / 3) * n ** 2 - (8 / 5) * n ** 3,
    (56 / 15) * n ** 3,
  ];
  const E = easting - 500000;
  const N = north ? northing : northing - 10000000;
  const xi = N / (k0 * A);
  const eta = E / (k0 * A);
  let xiP = xi;
  let etaP = eta;
  for (let j = 1; j <= 3; j++) {
    xiP -= beta[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
    etaP -= beta[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
  }
  const chi = Math.asin(Math.sin(xiP) / Math.cosh(etaP));
  let phi = chi;
  for (let j = 1; j <= 3; j++) phi += delta[j - 1] * Math.sin(2 * j * chi);
  const lon0 = ((zone - 1) * 6 - 180 + 3) * (Math.PI / 180);
  const lam = lon0 + Math.atan2(Math.sinh(etaP), Math.cos(xiP));
  return { lat: (phi * 180) / Math.PI, lon: (lam * 180) / Math.PI };
}

export function webMercatorToLatLon(x: number, y: number): { lat: number; lon: number } {
  const R = 6378137;
  return {
    lon: (x / R) * (180 / Math.PI),
    lat: (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * (180 / Math.PI),
  };
}

export function toLatLon(crs: CrsInfo, x: number, y: number): { lat: number; lon: number } {
  if (crs.kind === 'geographic') return { lat: y, lon: x };
  if (crs.kind === 'utm') return utmToLatLon(x, y, crs.zone, crs.north);
  return webMercatorToLatLon(x, y);
}

/** Bounds (lat/lon) of an axis-aligned box given in the file's CRS. */
export function boxToBounds(crs: CrsInfo, minX: number, minY: number, maxX: number, maxY: number): LatLngBoundsLiteral {
  const pts = [toLatLon(crs, minX, minY), toLatLon(crs, minX, maxY), toLatLon(crs, maxX, minY), toLatLon(crs, maxX, maxY)];
  return {
    south: Math.min(...pts.map((p) => p.lat)),
    north: Math.max(...pts.map((p) => p.lat)),
    west: Math.min(...pts.map((p) => p.lon)),
    east: Math.max(...pts.map((p) => p.lon)),
  };
}

/** Cell size in metres for a raster whose pixel size is (rx, ry) in CRS units. */
export function cellSizeMeters(crs: CrsInfo, rx: number, ry: number, latCentre: number): { x: number; y: number } {
  if (crs.kind === 'geographic') return { x: Math.abs(rx) * metersPerDegLon(latCentre), y: Math.abs(ry) * M_PER_DEG_LAT };
  if (crs.kind === 'webmercator') {
    const s = Math.cos((latCentre * Math.PI) / 180); // Mercator scale
    return { x: Math.abs(rx) * s, y: Math.abs(ry) * s };
  }
  return { x: Math.abs(rx), y: Math.abs(ry) };
}

/** Local metric frame used to bin scattered points (CSV / LAS) into a regular grid. */
export function localFrame(crs: CrsInfo, cx: number, cy: number) {
  if (crs.kind === 'geographic') {
    const mLon = metersPerDegLon(cy);
    return {
      toLocal: (x: number, y: number): [number, number] => [(x - cx) * mLon, (y - cy) * M_PER_DEG_LAT],
    };
  }
  const s = crs.kind === 'webmercator' ? Math.cos((toLatLon(crs, cx, cy).lat * Math.PI) / 180) : 1;
  return { toLocal: (x: number, y: number): [number, number] => [(x - cx) * s, (y - cy) * s] };
}
