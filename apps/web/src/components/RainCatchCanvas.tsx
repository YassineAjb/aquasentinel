import { useEffect, useRef, type MouseEvent } from 'react';
import type { HarvestCandidate, TerrainAnalysis } from '../raincatch/types';

export type VizMode = 'elevation' | 'flood' | 'water' | 'slope';

type Props = {
  analysis: TerrainAnalysis | null;
  floodScore?: Float32Array | null;
  waterDepth?: Float32Array | null;
  candidates?: HarvestCandidate[];
  selectedCandidateId?: string | null;
  mode: VizMode;
  opacity?: number;
  onPickCell?: (r: number, c: number) => void;
  onPickCandidate?: (id: string) => void;
};

function elevColor(t: number): [number, number, number] {
  // muted earth → green ridge
  const stops: [number, number, number, number][] = [
    [0, 42, 58, 48],
    [0.35, 78, 98, 62],
    [0.65, 120, 140, 78],
    [1, 190, 198, 150],
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
  return [190, 198, 150];
}

function floodColor(t: number): [number, number, number] {
  if (t < 0.2) return [28, 48, 58];
  if (t < 0.4) return [36, 90, 120];
  if (t < 0.6) return [40, 130, 170];
  if (t < 0.8) return [70, 170, 210];
  return [180, 230, 255];
}

function slopeColor(t: number): [number, number, number] {
  if (t < 0.15) return [50, 90, 60];
  if (t < 0.35) return [110, 130, 55];
  if (t < 0.55) return [170, 130, 50];
  if (t < 0.75) return [180, 80, 40];
  return [140, 40, 40];
}

export default function RainCatchCanvas({
  analysis,
  floodScore,
  waterDepth,
  candidates = [],
  selectedCandidateId,
  mode,
  opacity = 0.85,
  onPickCell,
  onPickCandidate,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap || !analysis) return;

    const paint = () => {
      const { cols, rows, z, hillshade, slope, elevation } = analysis;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const maxW = wrap.clientWidth;
      const maxH = wrap.clientHeight;
      const scale = Math.min(maxW / cols, maxH / rows);
      const w = Math.max(1, Math.floor(cols * scale));
      const h = Math.max(1, Math.floor(rows * scale));
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

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
        const zi = z[i];
        const o = i * 4;
        if (!Number.isFinite(zi)) {
          data[o] = 12;
          data[o + 1] = 16;
          data[o + 2] = 14;
          data[o + 3] = 255;
          continue;
        }
        const shade = 0.35 + 0.65 * (Number.isFinite(hillshade[i]) ? hillshade[i] : 0.6);
        let rgb: [number, number, number];
        if (mode === 'flood' && floodScore) {
          rgb = floodColor(Math.min(1, floodScore[i] / floodMax));
        } else if (mode === 'water' && waterDepth) {
          const d = Math.min(1, waterDepth[i] / depthMax);
          const base = elevColor((zi - zMin) / zRange);
          rgb = [
            base[0] * (1 - d) + 40 * d,
            base[1] * (1 - d) + 160 * d,
            base[2] * (1 - d) + 220 * d,
          ];
        } else if (mode === 'slope') {
          rgb = slopeColor(Math.min(1, slope[i] / slopeMax));
        } else {
          rgb = elevColor((zi - zMin) / zRange);
        }
        data[o] = Math.round(rgb[0] * shade * opacity + 18 * (1 - opacity));
        data[o + 1] = Math.round(rgb[1] * shade * opacity + 22 * (1 - opacity));
        data[o + 2] = Math.round(rgb[2] * shade * opacity + 20 * (1 - opacity));
        data[o + 3] = 255;
      }

      const off = document.createElement('canvas');
      off.width = cols;
      off.height = rows;
      const octx = off.getContext('2d');
      if (!octx) return;
      octx.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(off, 0, 0, w, h);

      const cellW = w / cols;
      const cellH = h / rows;
      for (const c of candidates) {
        const x = (c.c + 0.5) * cellW;
        const y = (c.r + 0.5) * cellH;
        const sel = c.id === selectedCandidateId;
        ctx.beginPath();
        ctx.arc(x, y, sel ? 7 : 5, 0, Math.PI * 2);
        ctx.fillStyle = c.blocked
          ? '#ffb4a8'
          : c.suitability.startsWith('Excellent')
            ? '#7dbe8a'
            : c.suitability.startsWith('Good')
              ? '#9ec5a3'
              : '#ffe08a';
        ctx.fill();
        ctx.strokeStyle = sel ? '#fff' : 'rgba(0,0,0,0.55)';
        ctx.lineWidth = sel ? 2 : 1;
        ctx.stroke();
        if (sel || c.rank <= 3) {
          ctx.fillStyle = '#e7f0e8';
          ctx.font = `600 ${Math.max(10, cellW * 2.2)}px Figtree, sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText(c.id, x, y - (sel ? 10 : 8));
        }
      }
    };

    paint();
    const ro = new ResizeObserver(() => paint());
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [
    analysis,
    floodScore,
    waterDepth,
    candidates,
    selectedCandidateId,
    mode,
    opacity,
  ]);

  function handleClick(ev: MouseEvent<HTMLCanvasElement>) {
    if (!analysis || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    const c = Math.floor((x / rect.width) * analysis.cols);
    const r = Math.floor((y / rect.height) * analysis.rows);
    if (r < 0 || c < 0 || r >= analysis.rows || c >= analysis.cols) return;

    const hit = candidates.find(
      (cand) => Math.hypot(cand.r - r, cand.c - c) <= 2.5,
    );
    if (hit && onPickCandidate) {
      onPickCandidate(hit.id);
      return;
    }
    onPickCell?.(r, c);
  }

  return (
    <div className="rc-canvas-wrap" ref={wrapRef}>
      {!analysis ? (
        <div className="rc-canvas-empty">
          <p className="empty-title">No terrain loaded</p>
          <p>Pick a site and click Explore your site to run the simulation.</p>
        </div>
      ) : (
        <canvas
          ref={canvasRef}
          className="rc-canvas"
          onClick={handleClick}
          role="img"
          aria-label="RainCatch terrain visualization"
        />
      )}
    </div>
  );
}
