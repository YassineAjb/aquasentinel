const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:3000';

let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function getAuthToken() {
  return authToken;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      (data as { message?: string | string[] }).message ||
      (data as { error?: string }).error ||
      res.statusText;
    throw new Error(Array.isArray(message) ? message.join(', ') : String(message));
  }
  return data as T;
}

export type AuthUser = {
  id: string;
  email: string;
  name: string;
};

export type AuthResponse = {
  token: string;
  user: AuthUser;
};

export const authApi = {
  register: (name: string, email: string, password: string) =>
    request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    }),
  login: (email: string, password: string) =>
    request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  google: (credential: string) =>
    request<AuthResponse>('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ credential }),
    }),
  me: () => request<AuthUser>('/auth/me'),
};

export type Site = {
  _id: string;
  name: string;
  boundary: { type: 'Polygon'; coordinates: number[][][] };
  areaM2?: number;
  plantType?: string;
  plantAge?: string;
  soilType?: string;
};

export type PumpWindowRow = {
  date: string;
  startHour: number;
  endHour: number;
  slot: 'morning_soft' | 'evening_soft' | 'none';
  quality: 'soft' | 'skip' | 'blocked';
  volumeMm: number;
  volumeM3: number;
  estimatedKwh: number;
  vsPeakKwhSaved: number;
  reason: string;
};

export type PumpWindows = {
  label: string;
  windows: PumpWindowRow[];
  summary: {
    irrigateEvents: number;
    softWindows: number;
    skipEvents: number;
    blockedByInspect: boolean;
    totalKwhEstimate: number;
    totalKwhSavedVsPeak: number;
  };
  assumptions: string[];
  honesty: string;
};

export type IrrigationPlan = {
  siteId: string;
  generatedAt: string;
  label: string;
  estimate: {
    etcMmPerDay: number;
    need7Mm: number;
    need7M3: number;
    perEventMm: number;
    intervalDays: number;
    unitNote: string;
  };
  schedule: {
    date: string;
    action: 'irrigate' | 'skip' | 'inspect';
    volumeMm: number;
    volumeM3: number;
    reason: string;
  }[];
  pumpWindows?: PumpWindows;
  facts: Record<string, unknown>;
  narrative: { text: string; source: 'template' | 'ollama' | 'openai' };
  honesty: string;
};

export type Observation = {
  _id: string;
  siteId: string;
  acquiredAt?: string;
  sensor?: string;
  sceneId?: string;
  cloudCover?: number;
  stats?: {
    mean?: number;
    min?: number;
    max?: number;
    validPct?: number;
    validPixels?: number;
  };
  vegetation?: Record<string, { area_ha?: number; percentage?: number }>;
  overlay?: {
    imageBase64?: string;
    bounds?: [[number, number], [number, number]];
    opacity?: number;
    label?: string;
  };
  truecolor?: {
    bounds?: [[number, number], [number, number]];
    opacity?: number;
    label?: string;
  };
  imageUrls?: {
    ndvi?: string;
    truecolor?: string;
  };
  field?: { area_ha?: number; area_m2?: number };
};

export type CompareResult = {
  deltaMeanNdvi: number | null;
  inspect: {
    flag: boolean;
    reason: string;
    threshold?: number;
    evidence?: string[];
  };
  interpretation?: {
    label: string;
    text: string;
    factsOnly?: boolean;
  };
  provenance: {
    sensor: string;
    provider: string;
    measurement: string;
    display: string;
  };
  a: {
    id: string;
    acquiredAt?: string;
    mean?: number | null;
    min?: number;
    max?: number;
    cloudCover?: number;
    sceneId?: string;
    sensor?: string;
    coverage: { coverageTooLow: boolean; message: string | null; validPct?: number };
    truecolor?: string | null;
    ndvi?: string | null;
  };
  b: {
    id: string;
    acquiredAt?: string;
    mean?: number | null;
    min?: number;
    max?: number;
    cloudCover?: number;
    sceneId?: string;
    sensor?: string;
    coverage: { coverageTooLow: boolean; message: string | null; validPct?: number };
    truecolor?: string | null;
    ndvi?: string | null;
  };
};

export function observationImageUrl(
  siteId: string,
  obsId: string,
  kind: 'ndvi' | 'truecolor',
  variant?: 'original' | 'enhanced',
) {
  const base = `${API_URL}/sites/${siteId}/observations/${obsId}/image/${kind}`;
  if (kind === 'truecolor' && variant === 'enhanced') {
    return `${base}?variant=enhanced`;
  }
  return base;
}

export type WeatherDay = {
  date: string;
  precipMm: number | null;
  tempMeanC: number | null;
  tempMaxC: number | null;
  tempMinC: number | null;
  et0Mm: number | null;
};

export type WeatherSeries = {
  siteId: string;
  lat: number;
  lon: number;
  from: string;
  to: string;
  source: string;
  fetchedAt: string | null;
  days: WeatherDay[];
  sceneDay: WeatherDay | null;
  note: string;
};

export function siteCentroid(site: Site): { lat: number; lon: number } | null {
  const ring = site.boundary?.coordinates?.[0];
  if (!ring?.length) return null;
  let lon = 0;
  let lat = 0;
  let n = 0;
  for (const pt of ring) {
    if (pt.length < 2) continue;
    lon += pt[0];
    lat += pt[1];
    n += 1;
  }
  if (!n) return null;
  return { lat: lat / n, lon: lon / n };
}

export const api = {
  health: () => request<{ ok: boolean; python: { ok: boolean } }>('/health'),
  listSites: () => request<Site[]>('/sites'),
  getSite: (id: string) => request<Site>(`/sites/${id}`),
  createSite: (body: {
    name: string;
    boundary: Site['boundary'];
    areaM2?: number;
    plantType?: string;
    plantAge?: string;
    soilType?: string;
  }) => request<Site>('/sites', { method: 'POST', body: JSON.stringify(body) }),
  updateSite: (
    id: string,
    body: {
      name?: string;
      boundary?: Site['boundary'];
      areaM2?: number;
      plantType?: string;
      plantAge?: string;
      soilType?: string;
    },
  ) =>
    request<Site>(`/sites/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteSite: (id: string) =>
    request<{ ok: boolean; deletedId: string }>(`/sites/${id}`, {
      method: 'DELETE',
    }),
  scanSite: (id: string, older = false) =>
    request<Observation>(`/sites/${id}/scan`, {
      method: 'POST',
      body: JSON.stringify({ older }),
    }),
  listObservations: (id: string) =>
    request<Observation[]>(`/sites/${id}/observations`),
  getObservation: (siteId: string, obsId: string) =>
    request<Observation>(`/sites/${siteId}/observations/${obsId}`),
  compare: (siteId: string, aId: string, bId: string) =>
    request<CompareResult>(`/sites/${siteId}/compare`, {
      method: 'POST',
      body: JSON.stringify({ aId, bId }),
    }),
  reportUrl: (siteId: string, aId: string, bId: string, print = false) => {
    const q = new URLSearchParams({ a: aId, b: bId });
    if (print) q.set('print', '1');
    return `${API_URL}/sites/${siteId}/report?${q.toString()}`;
  },
  savedReportUrl: (siteId: string, reportId: string, print = false) =>
    `${API_URL}/sites/${siteId}/reports/${reportId}${print ? '?print=1' : ''}`,
  listReports: (siteId: string) =>
    request<
      {
        _id: string;
        title: string;
        dateA?: string;
        dateB?: string;
        deltaMeanNdvi?: number | null;
        inspectFlag?: boolean;
        updatedAt?: string;
      }[]
    >(`/sites/${siteId}/reports`),
  saveReport: (siteId: string, aId: string, bId: string) =>
    request<{
      reportId: string;
      title: string;
      url: string;
      pdfUrl: string;
    }>(`/sites/${siteId}/reports`, {
      method: 'POST',
      body: JSON.stringify({ aId, bId }),
    }),
  getWeather: (
    siteId: string,
    opts: { from?: string; to?: string; around?: string; refresh?: boolean } = {},
  ) => {
    const q = new URLSearchParams();
    if (opts.from) q.set('from', opts.from);
    if (opts.to) q.set('to', opts.to);
    if (opts.around) q.set('around', opts.around);
    if (opts.refresh) q.set('refresh', '1');
    const qs = q.toString();
    return request<WeatherSeries>(
      `/sites/${siteId}/weather${qs ? `?${qs}` : ''}`,
    );
  },
  refreshWeather: (
    siteId: string,
    body: { from?: string; to?: string; around?: string } = {},
  ) =>
    request<WeatherSeries>(`/sites/${siteId}/weather/refresh`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  irrigationPlan: (siteId: string, observationId?: string) =>
    request<IrrigationPlan>(`/sites/${siteId}/irrigation-plan`, {
      method: 'POST',
      body: JSON.stringify(observationId ? { observationId } : {}),
    }),
  pumpWindows: (siteId: string, observationId?: string) =>
    request<{
      siteId: string;
      generatedAt: string;
      estimate: IrrigationPlan['estimate'];
      schedule: IrrigationPlan['schedule'];
      pumpWindows: PumpWindows;
      honesty: string;
    }>(`/sites/${siteId}/pump-windows`, {
      method: 'POST',
      body: JSON.stringify(observationId ? { observationId } : {}),
    }),
};

export type WaterGuardLive = {
  siteId: string;
  active: boolean;
  expectedFlow: number;
  flowRate: number;
  totalVolumeLiters: number;
  estimatedLossLiters: number;
  status: string;
  scenario?: string;
};

export type WaterMeasurement = {
  _id?: string;
  siteId: string;
  flowRate: number;
  expectedFlow: number;
  volumeLiters: number;
  estimatedLossLiters: number;
  irrigationActive: boolean;
  scenario: string;
  status: string;
  timestamp?: string;
};

export type WaterAlert = {
  _id: string;
  siteId: string;
  type: string;
  severity: string;
  expectedFlow: number;
  measuredFlow: number;
  excessPercentage: number;
  estimatedLossLiters: number;
  status: string;
  explanation: string;
  createdAt?: string;
  resolvedAt?: string | null;
};

export const waterguardApi = {
  start: (siteId: string, expectedFlow: number) =>
    request<WaterGuardLive>(`/waterguard/${siteId}/start`, {
      method: 'POST',
      body: JSON.stringify({ expectedFlow }),
    }),
  stop: (siteId: string) =>
    request<WaterGuardLive>(`/waterguard/${siteId}/stop`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  simulate: (
    siteId: string,
    scenario: 'NORMAL' | 'SLOW_LEAK' | 'MAJOR_LEAK' | 'OFF',
  ) =>
    request<WaterGuardLive>(`/waterguard/${siteId}/simulate`, {
      method: 'POST',
      body: JSON.stringify({ scenario }),
    }),
  live: (siteId: string) =>
    request<WaterGuardLive>(`/waterguard/${siteId}/live`),
  history: (siteId: string, limit = 100) =>
    request<WaterMeasurement[]>(
      `/waterguard/${siteId}/history?limit=${limit}`,
    ),
  alerts: (siteId: string) =>
    request<WaterAlert[]>(`/waterguard/${siteId}/alerts`),
  resolveAlert: (alertId: string) =>
    request<WaterAlert>(`/waterguard/alerts/${alertId}/resolve`, {
      method: 'PATCH',
      body: JSON.stringify({}),
    }),
};
