import { SOILS } from '../config';
import type {
  AccumulationZone,
  HarvestCandidate,
  SimulationParams,
  SimulationResult,
  TerrainAnalysis,
} from '../types';

const m3 = (v: number) => `${v >= 100 ? Math.round(v) : v.toFixed(1)} m³`;

/** Recommendation for a zone — always built from that zone's own computed numbers. */
export function zoneRecommendation(z: AccumulationZone, p: SimulationParams): string {
  if (z.likelyArtifact)
    return 'Probably a DEM artefact (relief within the vertical error). Do not plan works from this zone; verify on site or with a higher-quality DEM.';
  if (z.kind === 'convergence')
    return `Concentrated flow corridor (peak routed volume ≈ ${m3(z.inflowM3)} for ${p.rainfallMm} mm). Keep it free of crops and structures, protect the soil against gullying (grass strip, check dams) and verify drainage on site.`;
  if (z.risk === 'Critical' || z.risk === 'High')
    return z.overflowM3 > 0
      ? `Receives about ${m3(z.inflowM3)} vs ${m3(z.capacityM3)} of topographic capacity: ~${m3(z.overflowM3)} would spill. Avoid cultivation of the lowest part, provide an overflow path, and consider it for controlled retention after a geotechnical check.`
      : `High exposure to water accumulation (${(z.fillRatio * 100).toFixed(0)} % of capacity used). Avoid sensitive crops in the lowest cells and monitor after heavy rain.`;
  if (z.risk === 'Moderate')
    return `Water may stand temporarily (${(z.fillRatio * 100).toFixed(0)} % of capacity used at ${p.rainfallMm} mm). Monitoring is recommended; improve soil structure to speed infiltration.`;
  return `Limited accumulation at ${p.rainfallMm} mm (${(z.fillRatio * 100).toFixed(0)} % of capacity). No specific action beyond routine monitoring.`;
}

/** Explains WHY a candidate is proposed, what drives its score, risks, what is missing and the next action. */
export function candidateRecommendation(c: HarvestCandidate, p: SimulationParams): string {
  const top = [...c.components].sort((x, y) => y.value * y.weight - x.value * x.weight).slice(0, 2);
  const weak = [...c.components].sort((x, y) => x.value - y.value)[0];
  const why = `Candidate ${c.id} ${c.kind === 'depression' ? 'is a natural topographic depression' : 'sits on a drainage corridor'} with ${c.components[0].note.toLowerCase()} and a mean slope of ${c.slopeDeg.toFixed(1)}°. The strongest score drivers are ${top.map((t) => t.label.toLowerCase()).join(' and ')}; the weakest is ${weak.label.toLowerCase()}.`;
  const volume = `For ${p.rainfallMm} mm it could receive ≈ ${m3(c.inflowM3)} and retain ≈ ${m3(c.harvestM3)} (capacity ${m3(c.capacityM3)}${c.kind === 'corridor' ? ', hypothetical excavated volume' : ''}).`;
  const risks = c.constraints.length ? `Constraints: ${c.constraints.slice(0, 3).join(' ')}` : 'No major constraint detected by the topographic screening.';
  const missing = `Missing information: ${c.missingInfo.slice(0, 3).join('; ')}.`;
  let action: string;
  switch (c.recommendationType) {
    case 'Site not recommended':
      action = 'Action: site not recommended — safety or data-quality constraints outweigh the benefits.';
      break;
    case 'Small farm reservoir':
      action = 'Action: a small farm reservoir could be studied here. A detailed soil infiltration and geotechnical assessment, spillway design and a dam-safety review are required before construction.';
      break;
    case 'Possible water retention basin':
      action = 'Action: possible water retention basin. A detailed soil infiltration and geotechnical assessment is required before construction.';
      break;
    case 'Runoff collection':
      action = 'Action: runoff collection (diversion bund and settling pit) along the corridor, then storage tank or pond after validation on site.';
      break;
    case 'Drainage improvement':
      action = 'Action: improve drainage (open ditch or grassed waterway) rather than store water here.';
      break;
    case 'Rainwater storage':
      action = 'Action: small-scale rainwater storage (tank or lined pit) is more appropriate than a basin.';
      break;
    case 'Soil water conservation':
      action = 'Action: favour soil water conservation (contour bunds, mulching, zaï/tabias-type micro-catchments) over storage structures.';
      break;
    default:
      action = 'Action: keep monitoring; collect better terrain and soil data before deciding.';
  }
  return [why, volume, risks, missing, action, `Soil: ${SOILS[p.soil].label} (assumed). Candidates require field validation.`].join(' ');
}

export interface OverviewItem {
  title: string;
  text: string;
}

/** "Water Intelligence Overview": terrain summary, main flows, risk zones, opportunities, recommendations. */
export function buildOverview(a: TerrainAnalysis, r: SimulationResult): OverviewItem[] {
  const ha = a.areaM2 / 10000;
  const e = a.elevation;
  const topZones = r.zones.filter((z) => !z.likelyArtifact).slice(0, 2);
  const best = r.candidates.filter((c) => !c.blocked)[0];
  const mainCorr = r.corridors[0];
  const t = r.totals;
  return [
    {
      title: 'Terrain summary',
      text: `${ha.toFixed(1)} ha, elevation ${e.min.toFixed(1)}–${e.max.toFixed(1)} m (relief ${e.relief.toFixed(1)} m), mean slope ${a.slopeStats.meanDeg.toFixed(1)}°. ${a.depressions.filter((d) => !d.likelyArtifact).length} depression(s) retained, ${a.depressions.filter((d) => d.likelyArtifact).length} flagged as probable artefact(s).`,
    },
    {
      title: 'Main water flows',
      text: mainCorr
        ? `${r.corridors.length} drainage corridor(s); the largest concentrates a contributing area of ${Math.round(mainCorr.maxAreaM2)} m² (${((mainCorr.maxAreaM2 / a.areaM2) * 100).toFixed(0)} % of the parcel). For ${r.params.rainfallMm} mm, ≈ ${m3(t.runoffVolumeM3)} of runoff is generated, ${m3(t.storedInDepressionsM3)} stay in depressions and ${m3(t.leavingParcelM3)} leave the parcel (topographic routing, simulated).`
        : 'No concentrated drainage corridor above the threshold.',
    },
    {
      title: 'Risk zones',
      text: topZones.length
        ? topZones.map((z) => `Zone ${z.id}: ${z.risk} (${z.kind}, ${Math.round(z.areaM2)} m², fill ${(z.fillRatio * 100).toFixed(0)} %)`).join('; ') + '. Flood figures are topographic susceptibility estimates, not flood predictions.'
        : 'No significant accumulation zone for this scenario.',
    },
    {
      title: 'Collection opportunities',
      text: best
        ? `${r.candidates.length} candidate site(s). Best: ${best.id} (${best.suitability}, score ${best.score.toFixed(0)}/100) — ≈ ${m3(best.harvestM3)} retained at ${r.params.rainfallMm} mm.`
        : 'No suitable candidate detected: increase the rainfall scenario, change soil assumptions or load a higher-resolution DEM.',
    },
    {
      title: 'Main recommendations',
      text: best
        ? `${best.recommendationType} at candidate ${best.id}, after soil and geotechnical validation. Keep high-flow corridors free of crops, and re-run the analysis when a real LiDAR/DEM is available.`
        : 'Collect better terrain data before planning works.',
    },
  ];
}
