import type { CorridorLine, HarvestCandidate, RoutePlan, TerrainAnalysis } from '../types';
import { DC, DR, cellLatLon } from './grid';
import { downstreamIndex } from './terrain';

/** Vectorises drainage corridors (cells above the threshold) into polylines, head → outlet. */
export function buildCorridors(a: TerrainAnalysis, maxLines = 60): CorridorLine[] {
  const { n, cols, rows } = a;
  const isC = (i: number) => a.contribAreaM2[i] >= a.corridorThresholdM2 && a.flowDir[i] !== -2;
  const upstreamCorr = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (!isC(i)) continue;
    const d = a.flowDir[i];
    if (d >= 0) {
      const j = downstreamIndex(i, d, cols);
      if (isC(j)) upstreamCorr[j]++;
    }
  }
  const heads: number[] = [];
  for (let i = 0; i < n; i++) if (isC(i) && upstreamCorr[i] === 0) heads.push(i);
  const visited = new Uint8Array(n);
  const lines: CorridorLine[] = [];
  const ll = (i: number): [number, number] => {
    const r = (i / cols) | 0;
    const p = cellLatLon(a.bounds, rows, cols, r, i - r * cols);
    return [p.lat, p.lon];
  };
  for (const h of heads) {
    const pts: [number, number][] = [];
    let i = h;
    let maxA = 0;
    for (;;) {
      pts.push(ll(i));
      maxA = Math.max(maxA, a.contribAreaM2[i]);
      const d = a.flowDir[i];
      if (d < 0) break;
      const j = downstreamIndex(i, d, cols);
      if (!isC(j)) break;
      if (visited[j]) {
        pts.push(ll(j));
        break;
      }
      visited[i] = 1;
      i = j;
    }
    if (pts.length >= 3) lines.push({ points: pts, maxAreaM2: maxA });
  }
  lines.sort((x, y) => y.maxAreaM2 - x.maxAreaM2);
  return lines.slice(0, maxLines);
}

/** Upstream contributing network of a candidate site: catchment, main path, sources, confluences. */
export function planRoute(a: TerrainAnalysis, cand: HarvestCandidate): RoutePlan {
  const { n, cols, rows } = a;
  const dest = cand.r * cols + cand.c;
  const mask = new Uint8Array(n);
  const queue: number[] = [dest];
  mask[dest] = 1;
  // reverse traversal: any neighbour whose D8 direction points into the current cell
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    const r = (i / cols) | 0;
    const c = i - r * cols;
    for (let k = 0; k < 8; k++) {
      const rr = r + DR[k];
      const cc = c + DC[k];
      if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue;
      const j = rr * cols + cc;
      if (mask[j]) continue;
      const d = a.flowDir[j];
      if (d >= 0 && downstreamIndex(j, d, cols) === i) {
        mask[j] = 1;
        queue.push(j);
      }
    }
  }
  const catchmentArea = queue.length * a.cellAreaM2;

  // main path: follow the upstream neighbour with the largest contributing area
  const rev: number[] = [dest];
  let cur = dest;
  for (let guard = 0; guard < n; guard++) {
    const r = (cur / cols) | 0;
    const c = cur - r * cols;
    let best = -1;
    let bestA = 0;
    for (let k = 0; k < 8; k++) {
      const rr = r + DR[k];
      const cc = c + DC[k];
      if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue;
      const j = rr * cols + cc;
      const d = a.flowDir[j];
      if (d >= 0 && downstreamIndex(j, d, cols) === cur && a.contribAreaM2[j] > bestA) {
        bestA = a.contribAreaM2[j];
        best = j;
      }
    }
    if (best < 0) break;
    rev.push(best);
    cur = best;
  }
  const latlon = (i: number): [number, number] => {
    const r = (i / cols) | 0;
    const p = cellLatLon(a.bounds, rows, cols, r, i - r * cols);
    return [p.lat, p.lon];
  };
  const mainPath = rev.slice().reverse().map(latlon);
  let pathLen = 0;
  for (let k = 1; k < rev.length; k++) {
    const r1 = (rev[k - 1] / cols) | 0;
    const c1 = rev[k - 1] - r1 * cols;
    const r2 = (rev[k] / cols) | 0;
    const c2 = rev[k] - r2 * cols;
    pathLen += Math.hypot((r1 - r2) * a.cellSizeY, (c1 - c2) * a.cellSizeX);
  }
  const drop = a.z[rev[rev.length - 1]] - a.z[dest];

  // source areas: highest 10 % of the catchment, grouped in a single area (centroid)
  const zs = queue.map((i) => a.z[i]).sort((x, y) => x - y);
  const z90 = zs[Math.floor(zs.length * 0.9)] ?? zs[zs.length - 1];
  let sr = 0;
  let sc = 0;
  let sz = 0;
  let k90 = 0;
  for (const i of queue) {
    if (a.z[i] >= z90) {
      const r = (i / cols) | 0;
      sr += r;
      sc += i - r * cols;
      sz += a.z[i];
      k90++;
    }
  }
  const sources = k90
    ? [
        {
          ...cellLatLon(a.bounds, rows, cols, Math.round(sr / k90), Math.round(sc / k90)),
          areaM2: k90 * a.cellAreaM2,
          meanElevation: sz / k90,
        },
      ]
    : [];

  // confluences inside the catchment: ≥ 2 upstream neighbours that are themselves corridor cells
  const conv: RoutePlan['convergencePoints'] = [];
  for (const i of queue) {
    const r = (i / cols) | 0;
    const c = i - r * cols;
    let nUp = 0;
    for (let k = 0; k < 8; k++) {
      const rr = r + DR[k];
      const cc = c + DC[k];
      if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue;
      const j = rr * cols + cc;
      const d = a.flowDir[j];
      if (d >= 0 && downstreamIndex(j, d, cols) === i && a.contribAreaM2[j] >= a.corridorThresholdM2) nUp++;
    }
    if (nUp >= 2) {
      const p = cellLatLon(a.bounds, rows, cols, r, c);
      conv.push({ lat: p.lat, lon: p.lon, areaM2: a.contribAreaM2[i] });
    }
  }
  conv.sort((x, y) => y.areaM2 - x.areaM2);

  // tributary corridors that drain into the candidate
  const tributaries = buildCorridors(a, 200).filter((l) => {
    const last = l.points[Math.floor(l.points.length / 2)];
    const rc = Math.floor(((a.bounds.north - last[0]) / (a.bounds.north - a.bounds.south)) * rows);
    const cc = Math.floor(((last[1] - a.bounds.west) / (a.bounds.east - a.bounds.west)) * cols);
    return rc >= 0 && cc >= 0 && rc < rows && cc < cols && mask[rc * cols + cc] === 1;
  });

  return {
    candidateId: cand.id,
    catchmentMask: mask,
    catchmentAreaM2: catchmentArea,
    mainPath,
    sourceAreas: sources,
    convergencePoints: conv.slice(0, 5),
    tributaries,
    maxFlowPathM: pathLen,
    elevationDropM: drop,
    note: 'Topographic corridors derived from the DEM (D8). They are NOT existing canals or pipes; any construction needs a field survey and design.',
  };
}
