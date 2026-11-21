import type { TerrainAnalysis } from './types';

export type VizMode = 'elevation' | 'flood' | 'water' | 'slope';

/** Spectral: blue = low, red = high (CutSheet-style elevation). */
export function elevColor(t: number): [number, number, number] {
  const stops: [number, number, number, number][] = [
    [0, 40, 80, 180],
    [0.25, 50, 170, 190],
    [0.5, 120, 200, 90],
    [0.75, 230, 170, 50],
    [1, 200, 55, 40],
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (t <= b[0]) {
      const u = (t - a[0]) / (b[0] - a[0] || 1);
      return [
        a[1] + (b[1] - a[1]) * u,
        a[2] + (b[2] - a[2]) * u,
        a[3] + (b[3] - a[3]) * u,
      ];
    }
  }
  return [200, 55, 40];
}

export function floodColor(t: number): [number, number, number] {
  if (t < 0.15) return [30, 50, 40];
  if (t < 0.35) return [40, 100, 140];
  if (t < 0.55) return [45, 145, 200];
  if (t < 0.75) return [80, 185, 230];
  return [200, 235, 255];
}

export function slopeColor(t: number): [number, number, number] {
  if (t < 0.15) return [55, 110, 70];
  if (t < 0.35) return [130, 150, 55];
  if (t < 0.55) return [190, 140, 45];
  if (t < 0.75) return [200, 85, 40];
  return [160, 40, 45];
}

export function legendFor(mode: VizMode): { low: string; high: string; title: string } {
  if (mode === 'flood') return { title: 'Flood risk', low: 'Low', high: 'High' };
  if (mode === 'water') return { title: 'Ponding', low: 'Dry', high: 'Deep' };
  if (mode === 'slope') return { title: 'Slope', low: 'Flat', high: 'Steep' };
  return { title: 'Elevation', low: 'Low', high: 'High' };
}

/** Paint analysis grid → PNG data URL (transparent outside valid cells). */
export function renderTerrainDataUrl(
  analysis: TerrainAnalysis,
  mode: VizMode,
  floodScore?: Float32Array | null,
  waterDepth?: Float32Array | null,
): string {
  const { cols, rows, z, hillshade, slope, elevation } = analysis;
  const canvas = document.createElement('canvas');
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const img = ctx.createImageData(cols, rows);
  const data = img.data;
  const zMin = elevation.min;
  const zRange = Math.max(1e-6, elevation.max - elevation.min);
  const slopeMax = Math.max(1e-6, analysis.slopeStats.maxDeg || 30);
  let floodMax = 1;
  if (floodScore) {
    for (let i = 0; i < floodScore.length; i++) {
      if (Number.isFinite(floodScore[i])) floodMax = Math.max(floodMax, floodScore[i]);
    }
  }
  let depthMax = 0.05;
  if (waterDepth) {
    for (let i = 0; i < waterDepth.length; i++) {
      if (Number.isFinite(waterDepth[i])) depthMax = Math.max(depthMax, waterDepth[i]);
    }
  }

  for (let i = 0; i < cols * rows; i++) {
    const o = i * 4;
    const zi = z[i];
    if (!Number.isFinite(zi)) {
      data[o + 3] = 0;
      continue;
    }
    const shade = 0.45 + 0.55 * (Number.isFinite(hillshade[i]) ? hillshade[i] : 0.65);
    let rgb: [number, number, number];
    if (mode === 'flood' && floodScore) {
      rgb = floodColor(Math.min(1, floodScore[i] / floodMax));
    } else if (mode === 'water' && waterDepth) {
      const d = Math.min(1, waterDepth[i] / depthMax);
      const base = elevColor((zi - zMin) / zRange);
      rgb = [
        base[0] * (1 - d * 0.85) + 35 * d,
        base[1] * (1 - d * 0.85) + 150 * d,
        base[2] * (1 - d * 0.85) + 230 * d,
      ];
    } else if (mode === 'slope') {
      rgb = slopeColor(Math.min(1, slope[i] / slopeMax));
    } else {
      rgb = elevColor((zi - zMin) / zRange);
    }
    data[o] = Math.round(rgb[0] * shade);
    data[o + 1] = Math.round(rgb[1] * shade);
    data[o + 2] = Math.round(rgb[2] * shade);
    data[o + 3] = 220;
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}
