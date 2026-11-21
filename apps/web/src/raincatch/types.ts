/* RainCatch — shared types (reconstructed from engine usage) */

export interface LatLngBoundsLiteral {
  south: number;
  north: number;
  west: number;
  east: number;
}

export type DemKind = 'DEM' | 'DTM' | 'DSM' | 'unknown';
export type DemSource = 'demo' | 'geotiff' | 'asc' | 'csv' | 'las';

export interface DemGrid {
  id: string;
  name: string;
  source: DemSource;
  isDemo: boolean;
  kind: DemKind;
  cols: number;
  rows: number;
  cellSizeX: number;
  cellSizeY: number;
  bounds: LatLngBoundsLiteral;
  z: Float32Array;
  crs: string;
  verticalErrorM: number;
  notes: string[];
  pointCount?: number;
  resampled?: boolean;
  originalCellSizeM?: number;
  fileName?: string;
  fileSizeBytes?: number;
}

export interface DemSummary {
  name: string;
  source: DemSource;
  isDemo: boolean;
  kind: DemKind;
  cols: number;
  rows: number;
  cellSizeM: number;
  crs: string;
  minZ: number;
  maxZ: number;
  areaM2: number;
  noDataPct: number;
  pointCount?: number;
  resampled?: boolean;
  originalCellSizeM?: number;
  bounds: LatLngBoundsLiteral;
  notes: string[];
}

/* ------------------------------------------------------------------ errors */

export type RainCatchErrorCode =
  | 'INCOMPATIBLE_FILE'
  | 'FILE_TOO_LARGE'
  | 'LAZ_UNSUPPORTED'
  | 'UNKNOWN_CRS'
  | 'INSUFFICIENT_TERRAIN'
  | 'INVALID_LIDAR'
  | 'INVALID_COORDINATES'
  | 'DEM_MISSING'
  | 'PROCESSING_FAILED'
  | 'SIMULATION_FAILED';

export interface RainCatchError {
  code: RainCatchErrorCode;
  message: string;
  solution: string;
}

/* ------------------------------------------------------------------ soils, config */

export type SoilType = 'sand' | 'sandyLoam' | 'loam' | 'clay';

export interface SoilInfo {
  label: string;
  /** SCS curve number (average antecedent moisture) */
  cn: number;
  /** 0-1: ability to retain water in a pond (1 = impermeable) */
  retention: number;
  infiltrationMmH: number;
}

export interface SlopeClasses {
  flat: number;
  gentle: number;
  moderate: number;
  steep: number;
}

export interface RainCatchConfig {
  slopeClasses: SlopeClasses;
  minDepressionDepthM: number;
  /** drainage corridor threshold, % of the analysed area */
  drainageThresholdPct: number;
  floodWeights: {
    relativeElevation: number;
    slope: number;
    flowAccumulation: number;
    corridorDistance: number;
    depression: number;
    rainfall: number;
  };
  riskThresholds: { low: number; moderate: number; high: number };
  floodThresholds: { veryLow: number; low: number; moderate: number; high: number };
  harvestWeights: {
    flowAccumulation: number;
    depression: number;
    slope: number;
    catchment: number;
    soil: number;
    accessibility: number;
  };
  harvestThresholds: { excellent: number; good: number; moderate: number };
  defaultFootprintM2: number;
  designDepthM: number;
  storageLossPct: number;
  /** SCS initial abstraction ratio Ia/S (0.2 = classic, 0.05 = often better for semi-arid storms) */
  initialAbstractionRatio: number;
}

export interface SimulationParams {
  rainfallMm: number;
  durationH: number;
  soil: SoilType;
  runoffCoefficientOverride?: number;
}

export type LayerId =
  | 'elevation'
  | 'slope'
  | 'flowDirection'
  | 'flowAccumulation'
  | 'drainagePaths'
  | 'waterAccumulation'
  | 'floodSusceptibility'
  | 'rainfall'
  | 'harvestCandidates'
  | 'agriSuitability';

/* ------------------------------------------------------------------ terrain analysis */

export interface ElevationStats {
  min: number;
  max: number;
  mean: number;
  std: number;
  relief: number;
  p10: number;
  p90: number;
  histogram: { from: number; to: number; count: number }[];
}

export type SlopeClassName = 'Flat' | 'Gentle' | 'Moderate' | 'Steep' | 'Very Steep';

export interface SlopeStats {
  meanDeg: number;
  maxDeg: number;
  classPct: Record<SlopeClassName, number>;
  histogram: { from: number; to: number; count: number }[];
}

export type Confidence = 'High' | 'Medium' | 'Low';

export interface Depression {
  id: number;
  cells: number;
  areaM2: number;
  maxDepthM: number;
  meanDepthM: number;
  volumeM3: number;
  minZ: number;
  spillZ: number;
  outletIdx: number;
  centroid: { lat: number; lon: number; r: number; c: number };
  touchesEdge: boolean;
  likelyArtifact: boolean;
  confidence: Confidence;
  contributingAreaM2: number;
  receivesUpstreamFlow: boolean;
  note: string;
}

export interface TerrainAnalysis {
  demId: string;
  cols: number;
  rows: number;
  n: number;
  cellSizeX: number;
  cellSizeY: number;
  cellAreaM2: number;
  areaM2: number;
  validCells: number;
  bounds: LatLngBoundsLiteral;
  z: Float32Array;
  filled: Float64Array;
  depth: Float32Array;
  slope: Float32Array;
  aspect: Float32Array;
  hillshade: Float32Array;
  flowDir: Int8Array;
  contribAreaM2: Float32Array;
  order: Uint32Array;
  twi: Float32Array;
  corridorDistM: Float32Array;
  corridorThresholdM2: number;
  depId: Int32Array;
  depressions: Depression[];
  elevation: ElevationStats;
  slopeStats: SlopeStats;
  maxContribAreaM2: number;
  isDemo: boolean;
  computeMs: number;
}

/* ------------------------------------------------------------------ simulation */

export type RiskLevel = 'Low' | 'Moderate' | 'High' | 'Critical';
export type FloodClass = 'Very Low' | 'Low' | 'Moderate' | 'High' | 'Very High';

export const ZONING_ORDER = [
  'Suitable Agricultural Zone',
  'High Runoff Zone',
  'Potential Flood Zone',
  'Water Accumulation Zone',
  'Water Harvesting Zone',
  'Protected Zone',
] as const;
export type ZoningClass = (typeof ZONING_ORDER)[number];

export interface AccumulationZone {
  id: string;
  kind: 'depression' | 'convergence';
  depressionId?: number;
  cells: number;
  areaM2: number;
  meanElevation: number;
  minElevation: number;
  depthM: number;
  contributingAreaM2: number;
  inflowM3: number;
  capacityM3: number;
  storedM3: number;
  overflowM3: number;
  fillRatio: number;
  meanFlood: number;
  rainfallMm: number;
  riskScore: number;
  risk: RiskLevel;
  confidence: Confidence;
  likelyArtifact: boolean;
  centroid: { lat: number; lon: number; r: number; c: number };
  reasons: string[];
  recommendation: string;
}

export type SuitabilityClass = 'Excellent Candidate' | 'Good Candidate' | 'Moderate Candidate' | 'Poor Candidate';

export type RecommendationType =
  | 'Small farm reservoir'
  | 'Possible water retention basin'
  | 'Runoff collection'
  | 'Drainage improvement'
  | 'Rainwater storage'
  | 'Soil water conservation'
  | 'Monitoring recommended'
  | 'Site not recommended';

export interface ScoreComponent {
  key: string;
  label: string;
  value: number;
  weight: number;
  note: string;
}

export interface HarvestCandidate {
  id: string;
  rank: number;
  kind: 'depression' | 'corridor';
  depressionId?: number;
  r: number;
  c: number;
  lat: number;
  lon: number;
  elevation: number;
  slopeDeg: number;
  footprintM2: number;
  catchmentM2: number;
  capacityM3: number;
  inflowM3: number;
  harvestM3: number;
  overflowM3: number;
  fillRatio: number;
  score: number;
  suitability: SuitabilityClass;
  components: ScoreComponent[];
  constraints: string[];
  missingInfo: string[];
  blocked: boolean;
  recommendationType: RecommendationType;
  recommendation: string;
  floodScore: number;
  distanceToEdgeM: number;
  confidence: Confidence;
}

export interface CorridorLine {
  points: [number, number][];
  maxAreaM2: number;
}

export interface RoutePlan {
  candidateId: string;
  catchmentMask: Uint8Array;
  catchmentAreaM2: number;
  mainPath: [number, number][];
  sourceAreas: { lat: number; lon: number; areaM2: number; meanElevation: number }[];
  convergencePoints: { lat: number; lon: number; areaM2: number }[];
  tributaries: CorridorLine[];
  maxFlowPathM: number;
  elevationDropM: number;
  note: string;
}

export type AlertType =
  | 'High Rainfall Scenario'
  | 'Potential Water Accumulation'
  | 'Potential Basin Overflow'
  | 'High Flow Concentration'
  | 'Flood Susceptibility'
  | 'Candidate Site Constraint'
  | 'Terrain Data Quality Issue';

export interface RainCatchAlert {
  id: string;
  type: AlertType;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  relatedZone: string;
  recommendation: string;
  simulation: string;
}

export interface SimulationTotals {
  rainfallVolumeM3: number;
  runoffVolumeM3: number;
  infiltrationVolumeM3: number;
  runoffCoefficient: number;
  storedInDepressionsM3: number;
  leavingParcelM3: number;
  meanFlood: number;
  floodClassPct: Record<FloodClass, number>;
  zoningPct: Record<ZoningClass, number>;
  riskCount: Record<RiskLevel, number>;
  harvestPotentialM3: number;
  infiltrationMmPerH: number;
}

export interface SimulationResult {
  params: SimulationParams;
  demId: string;
  runoffMm: Float32Array;
  flowM3: Float32Array;
  waterDepth: Float32Array;
  floodScore: Float32Array;
  zoneMap: Int16Array;
  zoning: Uint8Array;
  zones: AccumulationZone[];
  candidates: HarvestCandidate[];
  corridors: CorridorLine[];
  totals: SimulationTotals;
  alerts: RainCatchAlert[];
  computeMs: number;
}

/* ------------------------------------------------------------------ volume calculator */

export interface VolumeInputs {
  rainfallMm: number;
  catchmentM2: number;
  runoffCoefficient: number;
  lossesPct: number;
  storageCapacityM3: number;
}

export interface VolumeResult {
  grossM3: number;
  runoffM3: number;
  harvestM3: number;
  storageCapacityM3: number;
  storedM3: number;
  excessM3: number;
  efficiency: number;
  grossLitres: number;
  runoffLitres: number;
  harvestLitres: number;
}

/* ------------------------------------------------------------------ scenario comparison + worker protocol */

export interface ScenarioSummary {
  label: string;
  rainfallMm: number;
  rainfallM3: number;
  runoffM3: number;
  runoffCoefficient: number;
  storedM3: number;
  leavingM3: number;
  harvestPotentialM3: number;
  meanFlood: number;
  highFloodPct: number; // High + Very High
  criticalZones: number;
  highZones: number;
  overallRisk: 'Low' | 'Moderate' | 'High' | 'Very High';
}

export type EngineRequest =
  | {
      type: 'loadDemo';
      name?: string;
      center?: { lat: number; lon: number };
      siteId?: string;
      bounds?: LatLngBoundsLiteral;
      /** GeoJSON ring [lon, lat][] for parcel mask */
      polygon?: [number, number][];
    }
  | { type: 'parse'; fileName: string; buffer: ArrayBuffer; crs?: string }
  | { type: 'analyze'; config: RainCatchConfig }
  | { type: 'simulate'; params: SimulationParams; config: RainCatchConfig }
  | { type: 'route'; candidateId: string }
  | { type: 'compare'; scenarios: { label: string; mm: number }[]; params: SimulationParams; config: RainCatchConfig };

export type EngineResponse =
  | { kind: 'progress'; fraction: number; stage: string }
  | { kind: 'dem'; summary: DemSummary }
  | { kind: 'analysis'; analysis: TerrainAnalysis }
  | { kind: 'simulation'; result: SimulationResult }
  | { kind: 'route'; plan: RoutePlan }
  | { kind: 'compare'; scenarios: ScenarioSummary[] }
  | { kind: 'error'; error: RainCatchError };
