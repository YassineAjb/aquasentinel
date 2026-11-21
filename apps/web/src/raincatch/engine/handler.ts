import type { EngineRequest, EngineResponse, ScenarioSummary } from '../types';
import { toRainCatchError } from './errors';
import { generateDemoDem } from './demoTerrain';
import { parseDemFile } from './parsers';
import { EngineSession, runSimulation, summarizeDem } from './pipeline';
import { planRoute } from './route';

type Emit = (r: EngineResponse) => void;

/** Single entry point shared by the Web Worker and the (fallback) main-thread engine. */
export async function handleRequest(session: EngineSession, lastSim: { value: ReturnType<typeof runSimulation> | null }, req: EngineRequest, emit: Emit): Promise<void> {
  try {
    switch (req.type) {
      case 'loadDemo': {
        emit({ kind: 'progress', fraction: 0.2, stage: 'Fitting simulated terrain to site' });
        const dem = generateDemoDem({
          name: req.name,
          center: req.center,
          siteId: req.siteId,
          bounds: req.bounds,
          polygon: req.polygon,
        });
        session.setDem(dem);
        emit({ kind: 'dem', summary: summarizeDem(dem) });
        break;
      }
      case 'parse': {
        const dem = await parseDemFile(req.fileName, req.buffer, {
          crs: req.crs,
          onProgress: (fraction, stage) => emit({ kind: 'progress', fraction, stage }),
        });
        session.setDem(dem);
        emit({ kind: 'dem', summary: summarizeDem(dem) });
        break;
      }
      case 'analyze': {
        if (!session.dem) throw Object.assign(new Error('No terrain loaded.'), {});
        emit({ kind: 'progress', fraction: 0.3, stage: 'Slope, flow direction, accumulation, depressions' });
        const analysis = session.analyze(req.config);
        lastSim.value = null;
        emit({ kind: 'analysis', analysis });
        break;
      }
      case 'simulate': {
        emit({ kind: 'progress', fraction: 0.5, stage: 'Rainfall simulation' });
        const result = session.simulate(req.params, req.config);
        lastSim.value = result;
        emit({ kind: 'simulation', result });
        break;
      }
      case 'route': {
        const a = session.analysis;
        const sim = lastSim.value;
        const cand = sim?.candidates.find((c) => c.id === req.candidateId);
        if (!a || !sim || !cand) throw new Error('Run the analysis and simulation first, then pick a valid candidate.');
        emit({ kind: 'route', plan: planRoute(a, cand) });
        break;
      }
      case 'compare': {
        const a = session.analysis;
        if (!a) throw new Error('Run the terrain analysis first.');
        const out: ScenarioSummary[] = req.scenarios.map((s) => {
          const r = runSimulation(a, { ...req.params, rainfallMm: s.mm }, req.config);
          const t = r.totals;
          const highFlood = t.floodClassPct.High + t.floodClassPct['Very High'];
          const crit = r.zones.filter((z) => !z.likelyArtifact && z.risk === 'Critical').length;
          const high = r.zones.filter((z) => !z.likelyArtifact && z.risk === 'High').length;
          const overall: ScenarioSummary['overallRisk'] =
            crit > 0 || highFlood >= 15 ? 'Very High' : high > 0 || highFlood >= 5 ? 'High' : t.meanFlood >= 38 || r.zones.some((z) => !z.likelyArtifact && z.risk === 'Moderate') ? 'Moderate' : 'Low';
          return {
            label: s.label,
            rainfallMm: s.mm,
            rainfallM3: t.rainfallVolumeM3,
            runoffM3: t.runoffVolumeM3,
            runoffCoefficient: t.runoffCoefficient,
            storedM3: t.storedInDepressionsM3,
            leavingM3: t.leavingParcelM3,
            harvestPotentialM3: t.harvestPotentialM3,
            meanFlood: t.meanFlood,
            highFloodPct: highFlood,
            criticalZones: crit,
            highZones: high,
            overallRisk: overall,
          };
        });
        emit({ kind: 'compare', scenarios: out });
        break;
      }
    }
  } catch (e) {
    emit({ kind: 'error', error: toRainCatchError(e, req.type === 'simulate' || req.type === 'compare' ? 'SIMULATION_FAILED' : 'PROCESSING_FAILED') });
  }
}
