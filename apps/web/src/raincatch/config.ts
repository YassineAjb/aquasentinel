import type { RainCatchConfig, SimulationParams, SoilInfo, SoilType } from './types';

export const SOILS: Record<SoilType, SoilInfo> = {
  sand: { label: 'Sandy (very permeable)', cn: 60, retention: 0.25, infiltrationMmH: 50 },
  sandyLoam: { label: 'Sandy loam', cn: 68, retention: 0.45, infiltrationMmH: 25 },
  loam: { label: 'Loam', cn: 75, retention: 0.6, infiltrationMmH: 13 },
  clay: { label: 'Clay (low permeability)', cn: 85, retention: 0.85, infiltrationMmH: 3 },
};

export const DEFAULT_CONFIG: RainCatchConfig = {
  slopeClasses: { flat: 1, gentle: 3, moderate: 8, steep: 15 },
  minDepressionDepthM: 0.05,
  drainageThresholdPct: 2,
  floodWeights: { relativeElevation: 0.2, slope: 0.15, flowAccumulation: 0.25, corridorDistance: 0.15, depression: 0.15, rainfall: 0.1 },
  riskThresholds: { low: 25, moderate: 50, high: 75 },
  floodThresholds: { veryLow: 20, low: 40, moderate: 60, high: 80 },
  harvestWeights: { flowAccumulation: 0.25, depression: 0.25, slope: 0.15, catchment: 0.15, soil: 0.1, accessibility: 0.1 },
  harvestThresholds: { excellent: 75, good: 60, moderate: 45 },
  defaultFootprintM2: 300,
  designDepthM: 1.5,
  storageLossPct: 15,
  initialAbstractionRatio: 0.05,
};

export const DEFAULT_PARAMS: SimulationParams = { rainfallMm: 30, durationH: 6, soil: 'loam' };

export const SCENARIOS = [
  { id: 'light', label: 'Light Rain', mm: 10 },
  { id: 'moderate', label: 'Moderate Rain', mm: 25 },
  { id: 'heavy', label: 'Heavy Rain', mm: 50 },
  { id: 'extreme', label: 'Extreme Rain', mm: 80 },
] as const;
