import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Site, SiteDocument } from '../sites/schemas/site.schema';
import {
  WeatherCache,
  WeatherCacheDocument,
  WeatherDay,
} from './schemas/weather-cache.schema';

type OpenMeteoDaily = {
  time?: string[];
  precipitation_sum?: (number | null)[];
  temperature_2m_mean?: (number | null)[];
  temperature_2m_max?: (number | null)[];
  temperature_2m_min?: (number | null)[];
  et0_fao_evapotranspiration?: (number | null)[];
};

const DAILY_VARS =
  'precipitation_sum,temperature_2m_mean,temperature_2m_max,temperature_2m_min,et0_fao_evapotranspiration';

@Injectable()
export class WeatherService {
  constructor(
    @InjectModel(WeatherCache.name)
    private readonly weatherModel: Model<WeatherCacheDocument>,
    @InjectModel(Site.name) private readonly siteModel: Model<SiteDocument>,
  ) {}

  private oid(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid site id');
    }
    return new Types.ObjectId(id);
  }

  private centroid(site: {
    boundary?: { coordinates?: number[][][] };
  }): { lat: number; lon: number } {
    const ring = site.boundary?.coordinates?.[0];
    if (!ring?.length) {
      throw new BadRequestException('Site has no boundary for weather lookup');
    }
    let lon = 0;
    let lat = 0;
    let n = 0;
    for (const pt of ring) {
      if (!pt || pt.length < 2) continue;
      lon += pt[0];
      lat += pt[1];
      n += 1;
    }
    if (!n) throw new BadRequestException('Invalid site boundary');
    return { lat: lat / n, lon: lon / n };
  }

  private isoDay(d: Date) {
    return d.toISOString().slice(0, 10);
  }

  private addDays(iso: string, delta: number) {
    const d = new Date(`${iso}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + delta);
    return this.isoDay(d);
  }

  private num(v: number | null | undefined): number | null {
    if (v == null || Number.isNaN(Number(v))) return null;
    return Number(v);
  }

  private parseDaily(daily?: OpenMeteoDaily): WeatherDay[] {
    const times = daily?.time || [];
    return times.map((date, i) => ({
      date,
      precipMm: this.num(daily?.precipitation_sum?.[i]),
      tempMeanC: this.num(daily?.temperature_2m_mean?.[i]),
      tempMaxC: this.num(daily?.temperature_2m_max?.[i]),
      tempMinC: this.num(daily?.temperature_2m_min?.[i]),
      et0Mm: this.num(daily?.et0_fao_evapotranspiration?.[i]),
    }));
  }

  private async fetchOpenMeteo(
    lat: number,
    lon: number,
    startDate: string,
    endDate: string,
  ): Promise<{ days: WeatherDay[]; source: string }> {
    const today = this.isoDay(new Date());
    const archiveEnd = endDate < today ? endDate : this.addDays(today, -2);
    const days: WeatherDay[] = [];
    let source = 'Open-Meteo';

    if (startDate <= archiveEnd) {
      const url = new URL('https://archive-api.open-meteo.com/v1/archive');
      url.searchParams.set('latitude', String(lat));
      url.searchParams.set('longitude', String(lon));
      url.searchParams.set('start_date', startDate);
      url.searchParams.set(
        'end_date',
        archiveEnd < endDate ? archiveEnd : endDate,
      );
      url.searchParams.set('daily', DAILY_VARS);
      url.searchParams.set('timezone', 'auto');
      const res = await fetch(url.toString());
      if (!res.ok) {
        throw new BadRequestException(
          `Open-Meteo archive failed (${res.status})`,
        );
      }
      const data = (await res.json()) as { daily?: OpenMeteoDaily };
      days.push(...this.parseDaily(data.daily));
      source = 'Open-Meteo archive';
    }

    if (endDate > archiveEnd) {
      const forecastStart =
        startDate > this.addDays(archiveEnd, 1)
          ? startDate
          : this.addDays(archiveEnd, 1);
      const url = new URL('https://api.open-meteo.com/v1/forecast');
      url.searchParams.set('latitude', String(lat));
      url.searchParams.set('longitude', String(lon));
      url.searchParams.set('start_date', forecastStart);
      url.searchParams.set('end_date', endDate);
      url.searchParams.set('daily', DAILY_VARS);
      url.searchParams.set('timezone', 'auto');
      const res = await fetch(url.toString());
      if (!res.ok) {
        throw new BadRequestException(
          `Open-Meteo forecast failed (${res.status})`,
        );
      }
      const data = (await res.json()) as { daily?: OpenMeteoDaily };
      days.push(...this.parseDaily(data.daily));
      source =
        source === 'Open-Meteo archive'
          ? 'Open-Meteo archive + forecast'
          : 'Open-Meteo forecast';
    }

    return { days, source };
  }

  private mergeDays(existing: WeatherDay[], incoming: WeatherDay[]) {
    const map = new Map<string, WeatherDay>();
    for (const d of existing) map.set(d.date, d);
    for (const d of incoming) map.set(d.date, d);
    return [...map.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  }

  private missingRange(
    days: WeatherDay[],
    startDate: string,
    endDate: string,
  ): { start: string; end: string } | null {
    const have = new Set(days.map((d) => d.date));
    let start: string | null = null;
    let end: string | null = null;
    let cursor = startDate;
    while (cursor <= endDate) {
      if (!have.has(cursor)) {
        start ??= cursor;
        end = cursor;
      }
      cursor = this.addDays(cursor, 1);
    }
    if (!start || !end) return null;
    return { start, end };
  }

  async getForSite(
    siteId: string,
    opts: { from?: string; to?: string; around?: string; refresh?: boolean } = {},
  ) {
    const site = await this.siteModel.findById(this.oid(siteId)).lean();
    if (!site) throw new NotFoundException('Site not found');
    const { lat, lon } = this.centroid(site);

    let from = opts.from;
    let to = opts.to;
    if (opts.around) {
      from = this.addDays(opts.around, -6);
      to = opts.around;
    }
    if (!from || !to) {
      const today = this.isoDay(new Date());
      to = to || today;
      from = from || this.addDays(to, -13);
    }
    if (from > to) {
      throw new BadRequestException('from must be <= to');
    }

    let cache = await this.weatherModel.findOne({ siteId: this.oid(siteId) });
    const need =
      opts.refresh || !cache
        ? { start: from, end: to }
        : this.missingRange(cache.days || [], from, to);

    if (need) {
      const { days, source } = await this.fetchOpenMeteo(
        lat,
        lon,
        need.start,
        need.end,
      );
      if (!cache) {
        cache = await this.weatherModel.create({
          siteId: this.oid(siteId),
          lat,
          lon,
          days,
          source,
          fetchedAt: new Date(),
        });
      } else {
        cache.lat = lat;
        cache.lon = lon;
        cache.days = this.mergeDays(cache.days || [], days);
        cache.source = source;
        cache.fetchedAt = new Date();
        await cache.save();
      }
    }

    const all = cache?.days || [];
    const filtered = all.filter((d) => d.date >= from! && d.date <= to!);
    const sceneDay = opts.around
      ? filtered.find((d) => d.date === opts.around) || null
      : filtered[filtered.length - 1] || null;

    return {
      siteId,
      lat,
      lon,
      from,
      to,
      source: cache?.source || 'Open-Meteo',
      fetchedAt: cache?.fetchedAt || null,
      days: filtered,
      sceneDay,
      note: 'Context only — not a drought diagnosis',
    };
  }

  /** Prefetch a window ending on acquiredAt (used after scan). */
  async ensureAroundScene(siteId: string, acquiredAt?: string) {
    if (!acquiredAt || acquiredAt === '?') return null;
    try {
      return await this.getForSite(siteId, { around: acquiredAt });
    } catch {
      return null;
    }
  }

  async deleteForSite(siteId: string) {
    await this.weatherModel.deleteOne({ siteId: this.oid(siteId) });
  }
}
