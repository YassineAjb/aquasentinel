const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:3000';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    ...init,
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

export type Site = {
  _id: string;
  name: string;
  boundary: { type: 'Polygon'; coordinates: number[][][] };
  areaM2?: number;
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

/** Open-Meteo daily rainfall for the field centroid (context only — not a drought claim). */
export async function fetchDailyRainfall(
  lat: number,
  lon: number,
  date: string,
): Promise<{ date: string; rainMm: number | null; source: string }> {
  const url = new URL('https://archive-api.open-meteo.com/v1/archive');
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lon));
  url.searchParams.set('start_date', date);
  url.searchParams.set('end_date', date);
  url.searchParams.set('daily', 'precipitation_sum');
  url.searchParams.set('timezone', 'auto');
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error('Weather lookup failed');
  const data = (await res.json()) as {
    daily?: { time?: string[]; precipitation_sum?: (number | null)[] };
  };
  const rain = data.daily?.precipitation_sum?.[0];
  return {
    date,
    rainMm: rain == null || Number.isNaN(Number(rain)) ? null : Number(rain),
    source: 'Open-Meteo archive',
  };
}

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
  createSite: (body: { name: string; boundary: Site['boundary']; areaM2?: number }) =>
    request<Site>('/sites', { method: 'POST', body: JSON.stringify(body) }),
  updateSite: (
    id: string,
    body: { name?: string; boundary?: Site['boundary']; areaM2?: number },
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
  reportUrl: (siteId: string, aId: string, bId: string) =>
    `${API_URL}/sites/${siteId}/report?a=${encodeURIComponent(aId)}&b=${encodeURIComponent(bId)}`,
};
