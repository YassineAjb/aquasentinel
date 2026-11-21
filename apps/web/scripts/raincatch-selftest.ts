/* Run:  npx tsx scripts/raincatch-selftest.ts
 * Numerical sanity checks of the RainCatch engine on the synthetic demo terrain. */
import { DEFAULT_CONFIG } from '../src/raincatch/config';
import { generateDemoDem } from '../src/raincatch/engine/demoTerrain';
import { runSimulation } from '../src/raincatch/engine/pipeline';
import { analyzeTerrain } from '../src/raincatch/engine/terrain';
import { computeVolume } from '../src/raincatch/engine/volume';

let fails = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) fails++;
};

const dem = generateDemoDem();
const a = analyzeTerrain(dem, DEFAULT_CONFIG);
console.log(`grid ${a.cols}x${a.rows}, area ${(a.areaM2 / 1e4).toFixed(2)} ha, analysis ${a.computeMs.toFixed(0)} ms`);
console.log(`elevation ${a.elevation.min.toFixed(1)}–${a.elevation.max.toFixed(1)} m, mean slope ${a.slopeStats.meanDeg.toFixed(2)}°`, a.slopeStats.classPct);
console.log('depressions:', a.depressions.map((d) => `#${d.id} ${d.areaM2.toFixed(0)}m² d=${d.maxDepthM.toFixed(2)} V=${d.volumeM3.toFixed(0)} ${d.likelyArtifact ? 'ARTEFACT' : d.confidence}`).join(' | '));

ok(Math.abs(a.areaM2 / 1e4 - 12) < 0.2, 'demo parcel ≈ 12 ha');
// every valid cell must drain: following flowDir reaches an outlet without loops
let loops = 0;
for (let s = 0; s < a.n; s += 37) {
  let i = s, steps = 0;
  while (a.flowDir[i] >= 0 && steps++ < a.n) {
    const r = (i / a.cols) | 0, c = i - r * a.cols;
    const d = a.flowDir[i];
    const dr = [0, 1, 1, 1, 0, -1, -1, -1][d], dc = [1, 1, 0, -1, -1, -1, 0, 1][d];
    i = (r + dr) * a.cols + (c + dc);
  }
  if (steps >= a.n) loops++;
}
ok(loops === 0, 'D8 network has no loops');
// mass conservation of contributing area: sum over outlets = total area
let outletArea = 0;
for (let i = 0; i < a.n; i++) if (a.flowDir[i] === -1) outletArea += a.contribAreaM2[i];
ok(Math.abs(outletArea - a.areaM2) < 1, `contributing area at outlets = total area (${outletArea.toFixed(0)} vs ${a.areaM2.toFixed(0)})`);
ok(a.depressions.some((d) => d.likelyArtifact), 'artefact depressions detected');
ok(a.depressions.some((d) => !d.likelyArtifact), 'real depressions detected');

for (const mm of [5, 15, 30, 50, 80]) {
  const r = runSimulation(a, { rainfallMm: mm, durationH: 6, soil: 'loam' }, DEFAULT_CONFIG);
  const t = r.totals;
  // water balance: runoff = stored + leaving
  const bal = t.runoffVolumeM3 - t.storedInDepressionsM3 - t.leavingParcelM3;
  // pond volume = stored
  let pond = 0;
  for (let i = 0; i < a.n; i++) pond += r.waterDepth[i] * a.cellAreaM2;
  console.log(
    `${String(mm).padStart(3)} mm: rain ${t.rainfallVolumeM3.toFixed(0)} m³, runoff ${t.runoffVolumeM3.toFixed(0)} (C=${t.runoffCoefficient.toFixed(2)}), stored ${t.storedInDepressionsM3.toFixed(0)}, leaving ${t.leavingParcelM3.toFixed(0)}, pond ${pond.toFixed(0)}, meanFlood ${t.meanFlood.toFixed(0)}, zones ${r.zones.length}, risk ${JSON.stringify(t.riskCount)}, cand ${r.candidates.length}, alerts ${r.alerts.length}, ${r.computeMs.toFixed(0)} ms`,
  );
  ok(Math.abs(bal) < 1e-3 * Math.max(1, t.runoffVolumeM3) + 0.01, `${mm} mm: runoff = stored + leaving (residual ${bal.toFixed(4)} m³)`);
  ok(Math.abs(pond - t.storedInDepressionsM3) < 0.02 * Math.max(1, t.storedInDepressionsM3) + 0.5, `${mm} mm: ponded volume ≈ stored volume`);
  if (mm === 30) {
    console.log('zones:', r.zones.map((z) => `${z.id}:${z.kind[0]} ${z.risk} fill=${(z.fillRatio * 100).toFixed(0)}% ${z.areaM2.toFixed(0)}m²`).join(' | '));
    console.log('candidates:', r.candidates.map((c) => `${c.id}:${c.kind[0]} ${c.score.toFixed(0)} ${c.suitability}${c.blocked ? ' BLOCKED' : ''} cap=${c.capacityM3.toFixed(0)} harvest=${c.harvestM3.toFixed(0)} (${c.r},${c.c})`).join(' | '));
    console.log('flood pct', t.floodClassPct, '\nzoning', t.zoningPct);
    console.log('corridors', r.corridors.length);
  }
}
const lo = runSimulation(a, { rainfallMm: 5, durationH: 6, soil: 'loam' }, DEFAULT_CONFIG);
const hi = runSimulation(a, { rainfallMm: 80, durationH: 6, soil: 'loam' }, DEFAULT_CONFIG);
ok(hi.totals.meanFlood > lo.totals.meanFlood, 'flood susceptibility increases with rainfall');
ok(hi.totals.runoffCoefficient > lo.totals.runoffCoefficient, 'SCS runoff coefficient increases with rainfall');

const v = computeVolume({ rainfallMm: 30, catchmentM2: 10000, runoffCoefficient: 0.3, lossesPct: 10, storageCapacityM3: 50 });
ok(Math.abs(v.grossM3 - 300) < 1e-9 && Math.abs(v.runoffM3 - 90) < 1e-9 && Math.abs(v.harvestM3 - 81) < 1e-9 && Math.abs(v.excessM3 - 31) < 1e-9, 'V = P×A×C (30 mm × 1 ha × 0.3 = 90 m³)');
console.log(fails ? `\n${fails} FAILURE(S)` : '\nALL CHECKS PASSED');
process.exit(fails ? 1 : 0);
