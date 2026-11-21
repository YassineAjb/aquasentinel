import type { RainCatchAlert, SimulationResult, TerrainAnalysis } from '../types';

type Draft = Omit<SimulationResult, 'alerts'>;

export function buildAlerts(a: TerrainAnalysis, r: Draft): RainCatchAlert[] {
  const sim = `${r.params.rainfallMm} mm · ${r.params.soil}`;
  const out: RainCatchAlert[] = [];
  let k = 0;
  const push = (x: Omit<RainCatchAlert, 'id' | 'simulation'>) => out.push({ ...x, id: `AL-${++k}`, simulation: sim });

  if (r.params.rainfallMm >= 50)
    push({
      type: 'High Rainfall Scenario',
      severity: r.params.rainfallMm >= 80 ? 'critical' : 'warning',
      title: `High rainfall scenario (${r.params.rainfallMm} mm)`,
      description: `The simulated event generates ≈ ${Math.round(r.totals.runoffVolumeM3)} m³ of runoff over the parcel (runoff coefficient ${r.totals.runoffCoefficient.toFixed(2)}).`,
      relatedZone: 'Whole parcel',
      recommendation: 'Check drainage corridors and spillways for this scenario; compare with local rainfall statistics.',
    });

  let nDep = 0;
  let nConv = 0;
  for (const z of r.zones) {
    if (z.likelyArtifact) continue;
    if (z.kind === 'depression' ? ++nDep > 4 : ++nConv > 2) continue;
    if (z.kind === 'depression' && (z.risk === 'High' || z.risk === 'Critical'))
      push({
        type: 'Potential Water Accumulation',
        severity: z.risk === 'Critical' ? 'critical' : 'warning',
        title: `Water accumulation — Zone ${z.id}`,
        description: `${Math.round(z.areaM2)} m² depression, fill ratio ${(z.fillRatio * 100).toFixed(0)} %, depth ${z.depthM.toFixed(2)} m.`,
        relatedZone: `Zone ${z.id}`,
        recommendation: z.recommendation,
      });
    if (z.kind === 'depression' && z.overflowM3 > 0)
      push({
        type: 'Potential Basin Overflow',
        severity: 'warning',
        title: `Overflow expected — Zone ${z.id}`,
        description: `Inflow ≈ ${z.inflowM3.toFixed(0)} m³ exceeds topographic capacity ${z.capacityM3.toFixed(0)} m³ (≈ ${z.overflowM3.toFixed(0)} m³ spill).`,
        relatedZone: `Zone ${z.id}`,
        recommendation: 'Provide a protected overflow path before using this depression for storage.',
      });
    if (z.kind === 'convergence' && (z.risk === 'High' || z.risk === 'Critical'))
      push({
        type: 'High Flow Concentration',
        severity: 'warning',
        title: `Flow concentration — Zone ${z.id}`,
        description: `Convergence corridor draining ≈ ${Math.round(z.contributingAreaM2)} m²; peak routed volume ≈ ${z.inflowM3.toFixed(0)} m³.`,
        relatedZone: `Zone ${z.id}`,
        recommendation: z.recommendation,
      });
  }
  const veryHigh = r.totals.floodClassPct['Very High'] + r.totals.floodClassPct['High'];
  if (veryHigh >= 5)
    push({
      type: 'Flood Susceptibility',
      severity: veryHigh >= 15 ? 'critical' : 'warning',
      title: 'Elevated flood susceptibility',
      description: `${veryHigh.toFixed(0)} % of the parcel is classified High or Very High (topographic susceptibility estimate, not a flood prediction).`,
      relatedZone: 'Low-lying zones',
      recommendation: 'Avoid permanent structures and sensitive crops in High / Very High cells.',
    });

  for (const c of r.candidates.slice(0, 5)) {
    if (c.blocked || c.overflowM3 > 0 || c.floodScore >= 80)
      push({
        type: 'Candidate Site Constraint',
        severity: c.blocked ? 'warning' : 'info',
        title: `Candidate ${c.id}: ${c.blocked ? 'not recommended' : 'constraint'}`,
        description: c.constraints.slice(0, 2).join(' ') || 'See candidate sheet.',
        relatedZone: `Candidate ${c.id}`,
        recommendation: 'Validate on site before any design.',
      });
  }

  const dq: string[] = [];
  if (a.isDemo) dq.push('DEMO DATA: synthetic terrain, not a LiDAR measurement.');
  if (a.cellSizeX > 5) dq.push(`Coarse resolution (${a.cellSizeX.toFixed(1)} m).`);
  const art = a.depressions.filter((d) => d.likelyArtifact).length;
  if (art) dq.push(`${art} depression(s) flagged as probable artefacts (excluded from routing and recommendations).`);
  if (a.validCells < a.n * 0.98) dq.push(`${(100 - (a.validCells / a.n) * 100).toFixed(1)} % no-data cells.`);
  if (dq.length)
    push({
      type: 'Terrain Data Quality Issue',
      severity: 'info',
      title: 'Terrain data quality',
      description: dq.join(' '),
      relatedZone: 'Whole parcel',
      recommendation: 'Use a measured DTM (LiDAR, photogrammetry) at ≤ 2 m resolution for decisions.',
    });

  const rank = { critical: 0, warning: 1, info: 2 } as const;
  return out.sort((x, y) => rank[x.severity] - rank[y.severity]);
}
