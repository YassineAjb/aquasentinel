import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Observation,
  ObservationDocument,
} from '../sites/schemas/observation.schema';
import { Site, SiteDocument } from '../sites/schemas/site.schema';
import { WeatherService } from '../weather/weather.service';

type PlantKey = 'olivier' | 'ble' | 'tomate' | 'agrumes' | 'autre';
type AgeKey = 'jeune' | 'vegetatif' | 'mature';
type SoilKey = 'sableux' | 'limoneux' | 'argileux';

const KC: Record<PlantKey, Record<AgeKey, number>> = {
  olivier: { jeune: 0.4, vegetatif: 0.55, mature: 0.65 },
  ble: { jeune: 0.35, vegetatif: 1.05, mature: 0.45 },
  tomate: { jeune: 0.45, vegetatif: 1.05, mature: 0.8 },
  agrumes: { jeune: 0.5, vegetatif: 0.65, mature: 0.7 },
  autre: { jeune: 0.45, vegetatif: 0.7, mature: 0.6 },
};

const SOIL: Record<
  SoilKey,
  { intervalDays: number; label: string; storeMm: number }
> = {
  sableux: { intervalDays: 2, label: 'sableux (faible réserve)', storeMm: 20 },
  limoneux: { intervalDays: 4, label: 'limoneux', storeMm: 35 },
  argileux: { intervalDays: 6, label: 'argileux (forte réserve)', storeMm: 50 },
};

@Injectable()
export class IrrigationService {
  constructor(
    @InjectModel(Site.name) private readonly siteModel: Model<SiteDocument>,
    @InjectModel(Observation.name)
    private readonly observationModel: Model<ObservationDocument>,
    private readonly weatherService: WeatherService,
  ) {}

  private oid(id: string, label = 'id') {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Invalid ${label}`);
    }
    return new Types.ObjectId(id);
  }

  private normPlant(v?: string): PlantKey {
    const s = (v || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    if (s.includes('oliv')) return 'olivier';
    if (s.includes('ble') || s.includes('wheat')) return 'ble';
    if (s.includes('tomat')) return 'tomate';
    if (s.includes('agrum') || s.includes('orange') || s.includes('citron'))
      return 'agrumes';
    return 'autre';
  }

  private normAge(v?: string): AgeKey {
    const s = (v || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    if (s.includes('jeun') || s.includes('plant') || s.includes('seed'))
      return 'jeune';
    if (s.includes('mat') || s.includes('adult') || s.includes('product'))
      return 'mature';
    return 'vegetatif';
  }

  private normSoil(v?: string): SoilKey {
    const s = (v || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    if (s.includes('sabl')) return 'sableux';
    if (s.includes('argil') || s.includes('clay')) return 'argileux';
    return 'limoneux';
  }

  private areaHa(site: Site, obs?: Observation | null): number {
    const fromField = (obs?.field as { area_ha?: number } | undefined)?.area_ha;
    if (fromField && fromField > 0) return fromField;
    if (site.areaM2 && site.areaM2 > 0) return site.areaM2 / 10000;
    // rough polygon area from lon/lat ring (small fields)
    const ring = site.boundary?.coordinates?.[0];
    if (!ring || ring.length < 3) return 1;
    let sum = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const [x1, y1] = ring[i];
      const [x2, y2] = ring[i + 1];
      sum += x1 * y2 - x2 * y1;
    }
    const deg2 = Math.abs(sum / 2);
    const m2 = deg2 * 111_320 * 111_320 * Math.cos(((ring[0][1] || 36) * Math.PI) / 180);
    const ha = m2 / 10000;
    return ha > 0.01 ? ha : 1;
  }

  private addDays(iso: string, delta: number) {
    const d = new Date(`${iso}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + delta);
    return d.toISOString().slice(0, 10);
  }

  async plan(siteId: string, observationId?: string) {
    const site = await this.siteModel.findById(this.oid(siteId, 'site id')).lean();
    if (!site) throw new NotFoundException('Site not found');

    if (!site.plantType || !site.plantAge || !site.soilType) {
      throw new BadRequestException(
        'Crop profile incomplete — set type plante, âge plante, and type terre on the site first.',
      );
    }

    let obs: Observation | null = null;
    if (observationId) {
      obs = (await this.observationModel
        .findOne({
          _id: this.oid(observationId, 'observation id'),
          siteId: this.oid(siteId, 'site id'),
        })
        .lean()) as Observation | null;
      if (!obs) throw new NotFoundException('Observation not found');
    } else {
      obs = (await this.observationModel
        .find({ siteId: this.oid(siteId, 'site id') })
        .sort({ acquiredAt: -1, createdAt: -1 })
        .limit(1)
        .lean()
        .then((rows) => rows[0] || null)) as Observation | null;
    }

    const plant = this.normPlant(site.plantType);
    const age = this.normAge(site.plantAge);
    const soil = this.normSoil(site.soilType);
    const kc = KC[plant][age];
    const soilInfo = SOIL[soil];
    const areaHa = this.areaHa(site as Site, obs);

    const around =
      obs?.acquiredAt && obs.acquiredAt !== '?'
        ? obs.acquiredAt
        : new Date().toISOString().slice(0, 10);

    const weather = await this.weatherService.getForSite(siteId, { around });
    const et0Values = weather.days
      .map((d) => d.et0Mm)
      .filter((v): v is number => v != null && !Number.isNaN(v));
    const rainValues = weather.days
      .map((d) => d.precipMm)
      .filter((v): v is number => v != null && !Number.isNaN(v));

    const et0Mean =
      et0Values.length > 0
        ? et0Values.reduce((a, b) => a + b, 0) / et0Values.length
        : 3.5;
    const rainTotal = rainValues.reduce((a, b) => a + b, 0);
    const rainScene = weather.sceneDay?.precipMm ?? 0;

    const etcMmDay = et0Mean * kc;
    const etc7Mm = etcMmDay * 7;
    const rainCreditMm = Math.min(rainTotal, etc7Mm);
    const netNeed7Mm = Math.max(0, etc7Mm - rainCreditMm);
    const netNeed7M3 = (netNeed7Mm / 1000) * areaHa * 10000;

    const ndviMean = obs?.stats?.mean ?? null;
    let stressFactor = 1;
    const stressNotes: string[] = [];
    if (ndviMean != null && ndviMean < 0.25) {
      stressFactor = 1.1;
      stressNotes.push(
        `Mean NDVI ${ndviMean.toFixed(3)} is low — slight upward bias on need (inspect crop before increasing water).`,
      );
    } else if (ndviMean != null && ndviMean > 0.55) {
      stressFactor = 0.95;
      stressNotes.push(
        `Mean NDVI ${ndviMean.toFixed(3)} looks vigorous — slight downward bias on need.`,
      );
    }

    const adjustedNeed7Mm = netNeed7Mm * stressFactor;
    const adjustedNeed7M3 = netNeed7M3 * stressFactor;
    const perEventMm = Math.min(
      soilInfo.storeMm,
      Math.max(adjustedNeed7Mm / Math.ceil(7 / soilInfo.intervalDays), 4),
    );

    const schedule: {
      date: string;
      action: 'irrigate' | 'skip' | 'inspect';
      volumeMm: number;
      volumeM3: number;
      reason: string;
    }[] = [];

    const start = this.addDays(around, 1);
    for (let i = 0; i < 7; i++) {
      const date = this.addDays(start, i);
      const dayRain =
        weather.days.find((d) => d.date === date)?.precipMm ?? null;
      if (ndviMean != null && ndviMean < 0.2 && i === 0) {
        schedule.push({
          date,
          action: 'inspect',
          volumeMm: 0,
          volumeM3: 0,
          reason: 'NDVI very low — ground check before irrigating.',
        });
        continue;
      }
      if (dayRain != null && dayRain >= perEventMm * 0.8) {
        schedule.push({
          date,
          action: 'skip',
          volumeMm: 0,
          volumeM3: 0,
          reason: `Forecast/archive rain ~${dayRain.toFixed(1)} mm covers a pulse.`,
        });
        continue;
      }
      if (i % soilInfo.intervalDays === 0 && adjustedNeed7Mm > 1) {
        const volM3 = (perEventMm / 1000) * areaHa * 10000;
        schedule.push({
          date,
          action: 'irrigate',
          volumeMm: Number(perEventMm.toFixed(1)),
          volumeM3: Number(volM3.toFixed(2)),
          reason: `Soil ${soilInfo.label}; interval ~${soilInfo.intervalDays}d; ETc≈${etcMmDay.toFixed(1)} mm/d.`,
        });
      } else {
        schedule.push({
          date,
          action: 'skip',
          volumeMm: 0,
          volumeM3: 0,
          reason: 'Between irrigation pulses for this soil type.',
        });
      }
    }

    const facts = {
      siteName: site.name,
      plantTypeInput: site.plantType,
      plantAgeInput: site.plantAge,
      soilTypeInput: site.soilType,
      plantKey: plant,
      ageKey: age,
      soilKey: soil,
      kc,
      et0MeanMm: Number(et0Mean.toFixed(2)),
      etcMmDay: Number(etcMmDay.toFixed(2)),
      rainTotal7Mm: Number(rainTotal.toFixed(1)),
      rainSceneMm: rainScene,
      areaHa: Number(areaHa.toFixed(3)),
      ndviMean,
      ndviDate: obs?.acquiredAt || null,
      observationId: obs
        ? String((obs as Observation & { _id?: Types.ObjectId })._id || '')
        : null,
      weatherSource: weather.source,
      stressFactor,
      stressNotes,
      method:
        'ETc ≈ ET₀ × Kc; net need ≈ ETc×7 − rain credit; volumes from field area. Indicative FAO-style sketch only.',
    };

    const estimate = {
      etcMmPerDay: facts.etcMmDay,
      need7Mm: Number(adjustedNeed7Mm.toFixed(1)),
      need7M3: Number(adjustedNeed7M3.toFixed(2)),
      perEventMm: Number(perEventMm.toFixed(1)),
      intervalDays: soilInfo.intervalDays,
      unitNote: 'mm = depth over field; m³ = volume for estimated area',
    };

    const narrative = await this.narrate(facts, estimate, schedule);

    return {
      siteId,
      generatedAt: new Date().toISOString(),
      label:
        'Generated irrigation advice (rules from structured facts — not a diagnosis or pump command)',
      estimate,
      schedule,
      facts,
      narrative,
      honesty:
        'NDVI is not soil moisture. Open-Meteo is not an on-field gauge. Farmer decides.',
    };
  }

  private async narrate(
    facts: Record<string, unknown>,
    estimate: {
      etcMmPerDay: number;
      need7Mm: number;
      need7M3: number;
      perEventMm: number;
      intervalDays: number;
    },
    schedule: { date: string; action: string; volumeMm: number; reason: string }[],
  ): Promise<{ text: string; source: 'template' | 'ollama' | 'openai' }> {
    const irrigateDays = schedule.filter((s) => s.action === 'irrigate');
    const template = [
      `For ${facts.siteName} (${facts.plantTypeInput}, ${facts.plantAgeInput}, soil ${facts.soilTypeInput}):`,
      `Estimated crop water use ≈ ${estimate.etcMmPerDay} mm/day (Kc=${facts.kc}, ET₀≈${facts.et0MeanMm} mm).`,
      `Next 7 days net need ≈ ${estimate.need7Mm} mm (~${estimate.need7M3} m³ on ~${facts.areaHa} ha), after rain credit ${facts.rainTotal7Mm} mm.`,
      irrigateDays.length
        ? `Suggested pulses about every ${estimate.intervalDays} day(s) (~${estimate.perEventMm} mm each), e.g. ${irrigateDays.map((d) => d.date).join(', ')}.`
        : 'Rain and soil store likely cover the week — no strong irrigation pulse suggested.',
      facts.stressNotes && (facts.stressNotes as string[]).length
        ? (facts.stressNotes as string[]).join(' ')
        : '',
      'This is decision support only — confirm on the ground before changing pumps.',
    ]
      .filter(Boolean)
      .join(' ');

    const system =
      'You write short irrigation advice for Tunisian farmers. Use ONLY the provided JSON facts. Do not invent sensors or diagnoses. Keep under 120 words. English is fine.';
    const user = JSON.stringify({ facts, estimate, schedule });
    const provider = (process.env.LLM_PROVIDER || 'ollama').toLowerCase();

    if (provider === 'ollama' || provider === 'local') {
      const ollamaText = await this.narrateOllama(system, user);
      if (ollamaText) return { text: ollamaText, source: 'ollama' };
      return { text: template, source: 'template' };
    }

    if (provider === 'openai') {
      const openaiText = await this.narrateOpenAI(system, user);
      if (openaiText) return { text: openaiText, source: 'openai' };
      return { text: template, source: 'template' };
    }

    return { text: template, source: 'template' };
  }

  private async narrateOllama(
    system: string,
    user: string,
  ): Promise<string | null> {
    const base = (
      process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434'
    ).replace(/\/$/, '');
    const model = process.env.OLLAMA_MODEL || process.env.LLM_MODEL || 'llama3.2';
    try {
      const res = await fetch(`${base}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: false,
          options: { temperature: 0.2 },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as {
        message?: { content?: string };
      };
      return data.message?.content?.trim() || null;
    } catch {
      return null;
    }
  }

  private async narrateOpenAI(
    system: string,
    user: string,
  ): Promise<string | null> {
    const key = process.env.OPENAI_API_KEY || process.env.LLM_API_KEY;
    if (!key) return null;
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: process.env.LLM_MODEL || 'gpt-4o-mini',
          temperature: 0.2,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      return data.choices?.[0]?.message?.content?.trim() || null;
    } catch {
      return null;
    }
  }
}
