import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { IrrigationService } from '../irrigation/irrigation.service';
import { ScanService } from '../scan/scan.service';
import { WeatherService } from '../weather/weather.service';
import { CompareDto } from './dto/compare.dto';
import { CreateSiteDto } from './dto/create-site.dto';
import { IrrigationPlanDto } from './dto/irrigation-plan.dto';
import { ScanDto } from './dto/scan.dto';
import { UpdateSiteDto } from './dto/update-site.dto';
import { Observation, ObservationDocument } from './schemas/observation.schema';
import { Report, ReportDocument } from './schemas/report.schema';
import { Site, SiteDocument } from './schemas/site.schema';

const NDVI_DROP_FLAG = 0.08;
const LOW_COVERAGE_PCT = 70;

@Injectable()
export class SitesService {
  constructor(
    @InjectModel(Site.name) private readonly siteModel: Model<SiteDocument>,
    @InjectModel(Observation.name)
    private readonly observationModel: Model<ObservationDocument>,
    @InjectModel(Report.name)
    private readonly reportModel: Model<ReportDocument>,
    private readonly scanService: ScanService,
    private readonly weatherService: WeatherService,
    private readonly irrigationService: IrrigationService,
  ) {}

  private oid(id: string, label = 'id') {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Invalid ${label}`);
    }
    return new Types.ObjectId(id);
  }

  private observationResponse(
    siteId: string,
    observationId: string,
    obs: {
      siteId?: unknown;
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
      vegetation?: Record<string, unknown>;
      field?: Record<string, unknown>;
      overlay?: {
        imageBase64?: string;
        bounds?: number[][];
        opacity?: number;
        label?: string;
      };
      truecolor?: {
        imageBase64?: string;
        bounds?: number[][];
        opacity?: number;
        label?: string;
      };
    },
    opts: { includeImages?: boolean } = {},
  ) {
    const includeImages = Boolean(opts.includeImages);
    return {
      _id: observationId,
      siteId,
      acquiredAt: obs.acquiredAt,
      sensor: obs.sensor,
      sceneId: obs.sceneId,
      cloudCover: obs.cloudCover,
      stats: obs.stats,
      vegetation: obs.vegetation,
      field: obs.field,
      overlay: obs.overlay
        ? {
            ...(includeImages && obs.overlay.imageBase64
              ? { imageBase64: obs.overlay.imageBase64 }
              : {}),
            bounds: obs.overlay.bounds,
            opacity: obs.overlay.opacity,
            label: obs.overlay.label,
          }
        : undefined,
      truecolor: obs.truecolor
        ? {
            bounds: obs.truecolor.bounds,
            opacity: obs.truecolor.opacity,
            label: obs.truecolor.label,
          }
        : undefined,
      imageUrls: {
        ndvi: `/sites/${siteId}/observations/${observationId}/image/ndvi`,
        truecolor: `/sites/${siteId}/observations/${observationId}/image/truecolor`,
      },
    };
  }

  create(dto: CreateSiteDto) {
    if (dto.boundary?.type !== 'Polygon' || !dto.boundary.coordinates?.length) {
      throw new BadRequestException('boundary must be a GeoJSON Polygon');
    }
    return this.siteModel.create(dto);
  }

  findAll() {
    return this.siteModel.find().sort({ createdAt: -1 }).lean();
  }

  async findOne(id: string) {
    const site = await this.siteModel.findById(this.oid(id, 'site id')).lean();
    if (!site) throw new NotFoundException('Site not found');
    return site;
  }

  async update(id: string, dto: UpdateSiteDto) {
    if (
      dto.boundary &&
      (dto.boundary.type !== 'Polygon' || !dto.boundary.coordinates?.length)
    ) {
      throw new BadRequestException('boundary must be a GeoJSON Polygon');
    }
    const site = await this.siteModel
      .findByIdAndUpdate(this.oid(id, 'site id'), { $set: dto }, { new: true })
      .lean();
    if (!site) throw new NotFoundException('Site not found');
    return site;
  }

  async remove(id: string) {
    const siteOid = this.oid(id, 'site id');
    const site = await this.siteModel.findByIdAndDelete(siteOid).lean();
    if (!site) throw new NotFoundException('Site not found');
    await this.observationModel.deleteMany({ siteId: siteOid });
    await this.reportModel.deleteMany({ siteId: siteOid });
    await this.weatherService.deleteForSite(id).catch(() => undefined);
    return { ok: true, deletedId: id };
  }

  getWeather(
    siteId: string,
    query: { from?: string; to?: string; around?: string; refresh?: string },
  ) {
    return this.weatherService.getForSite(siteId, {
      from: query.from,
      to: query.to,
      around: query.around,
      refresh: query.refresh === '1' || query.refresh === 'true',
    });
  }

  refreshWeather(
    siteId: string,
    body: { from?: string; to?: string; around?: string } = {},
  ) {
    return this.weatherService.getForSite(siteId, {
      ...body,
      refresh: true,
    });
  }

  irrigationPlan(siteId: string, dto: IrrigationPlanDto = {}) {
    return this.irrigationService.plan(siteId, dto.observationId);
  }

  pumpWindows(siteId: string, dto: IrrigationPlanDto = {}) {
    return this.irrigationService.pumpWindows(siteId, dto.observationId);
  }

  async scan(siteId: string, dto: ScanDto = {}) {
    const site = await this.findOne(siteId);
    const feature = {
      type: 'Feature',
      properties: { name: site.name },
      geometry: site.boundary,
    };

    let excludeItemIds: string[] = [];
    let excludeDates: string[] = [];
    if (dto.older) {
      const existing = await this.observationModel
        .find({ siteId: this.oid(siteId, 'site id') })
        .select('sceneId acquiredAt')
        .lean();
      excludeItemIds = existing
        .map((o) => o.sceneId)
        .filter((id): id is string => Boolean(id));
      // Same calendar day can have multiple S2 items — skip dates already scanned
      excludeDates = [
        ...new Set(
          existing
            .map((o) => o.acquiredAt)
            .filter((d): d is string => Boolean(d) && d !== '?'),
        ),
      ];
    }

    const raw = await this.scanService.scanPolygon(feature, {
      sceneIndex: 0,
      excludeItemIds,
      excludeDates,
    });
    const scene = (raw.scene || {}) as Record<string, unknown>;
    const ndvi = (raw.ndvi || {}) as Record<string, number>;
    const overlay = (raw.overlay || {}) as Record<string, unknown>;
    const truecolor = (raw.truecolor || {}) as Record<string, unknown>;
    const quality = (raw.quality || {}) as Record<string, unknown>;
    const provenance = (raw.provenance || {}) as Record<string, unknown>;

    const observation = await this.observationModel.create({
      siteId: this.oid(siteId, 'site id'),
      acquiredAt: String(scene.date || ''),
      sensor: 'sentinel-2-l2a',
      sceneId: String(scene.item || scene.id || ''),
      cloudCover: this.parseCloud(scene.cloud),
      stats: {
        mean: ndvi.average,
        min: ndvi.minimum,
        max: ndvi.maximum,
        validPct: ndvi.valid_coverage_pct,
        validPixels: ndvi.valid_pixels,
      },
      vegetation: raw.vegetation as Record<string, unknown>,
      overlay: {
        imageBase64: overlay.image_base64 as string | undefined,
        bounds: overlay.bounds as number[][] | undefined,
        opacity: overlay.opacity as number | undefined,
        label: overlay.label as string | undefined,
      },
      truecolor: {
        imageBase64: truecolor.image_base64 as string | undefined,
        bounds: truecolor.bounds as number[][] | undefined,
        opacity: truecolor.opacity as number | undefined,
        label: truecolor.label as string | undefined,
      },
      field: raw.field as Record<string, unknown>,
      raw: {
        scene: raw.scene,
        ndvi: raw.ndvi,
        quality,
        provenance,
        field: raw.field,
        vegetation: raw.vegetation,
      },
    });

    // Return scan payload with NDVI base64 (v0 map path) + bounds
    // Prefetch weather around the scene date for later analysis UI
    void this.weatherService.ensureAroundScene(
      siteId,
      String(scene.date || ''),
    );

    const plain =
      typeof (observation as { toObject?: () => unknown }).toObject === 'function'
        ? (observation as { toObject: () => typeof observation }).toObject()
        : observation;
    return this.observationResponse(siteId, String(observation._id), plain, {
      includeImages: true,
    });
  }

  async listObservations(siteId: string) {
    await this.findOne(siteId);
    return this.observationModel
      .find({ siteId: this.oid(siteId, 'site id') })
      .sort({ acquiredAt: -1, createdAt: -1 })
      .select('-raw -overlay.imageBase64 -truecolor.imageBase64')
      .lean();
  }

  async getObservation(siteId: string, observationId: string) {
    await this.findOne(siteId);
    const obs = await this.observationModel
      .findOne({
        _id: this.oid(observationId, 'observation id'),
        siteId: this.oid(siteId, 'site id'),
      })
      .select(
        'siteId acquiredAt sensor sceneId cloudCover stats vegetation field overlay.bounds overlay.opacity overlay.label truecolor.bounds truecolor.opacity truecolor.label',
      )
      .lean();
    if (!obs) throw new NotFoundException('Observation not found');
    return this.observationResponse(siteId, observationId, obs);
  }

  async getObservationImage(
    siteId: string,
    observationId: string,
    kind: 'ndvi' | 'truecolor',
    variant: 'original' | 'enhanced' = 'original',
  ) {
    await this.findOne(siteId);
    const filter = {
      _id: this.oid(observationId, 'observation id'),
      siteId: this.oid(siteId, 'site id'),
    };
    const obs = await this.observationModel
      .findOne(filter)
      .select(kind === 'ndvi' ? 'overlay' : 'truecolor')
      .lean();
    if (!obs) throw new NotFoundException('Observation not found');

    const b64 =
      kind === 'ndvi'
        ? obs.overlay?.imageBase64
        : obs.truecolor?.imageBase64;

    if (!b64) {
      throw new NotFoundException(
        `No ${kind} image stored for this observation. Re-run Scan latest / Scan older.`,
      );
    }
    const buf = Buffer.from(String(b64), 'base64');
    if (kind === 'truecolor' && variant === 'enhanced') {
      return this.enhanceTruecolorPng(buf);
    }
    return buf;
  }

  /**
   * Lightweight derived visual: upscale + contrast bump via PNG re-encode.
   * Same Sentinel-2 pixels — not a super-resolution measurement product.
   */
  private async enhanceTruecolorPng(buf: Buffer): Promise<Buffer> {
    try {
      // Optional dependency — falls back to original if sharp isn't installed
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const sharp = require('sharp') as typeof import('sharp');
      return await sharp(buf)
        .resize({ width: 1024, withoutEnlargement: false })
        .modulate({ saturation: 1.12, brightness: 1.04 })
        .sharpen({ sigma: 1.2 })
        .png()
        .toBuffer();
    } catch {
      return buf;
    }
  }

  private coverageWarning(obs: {
    stats?: { validPct?: number };
    cloudCover?: number;
  }) {
    const validPct = obs.stats?.validPct;
    const tooLow = validPct != null && validPct < LOW_COVERAGE_PCT;
    return {
      coverageTooLow: tooLow,
      validPct,
      cloudCover: obs.cloudCover,
      message: tooLow
        ? `Coverage too low (${validPct?.toFixed(1)}% valid pixels < ${LOW_COVERAGE_PCT}%)`
        : null,
    };
  }

  async compare(siteId: string, dto: CompareDto) {
    await this.findOne(siteId);
    const siteOid = this.oid(siteId, 'site id');
    const [a, b] = await Promise.all([
      this.observationModel
        .findOne({ _id: this.oid(dto.aId, 'observation id'), siteId: siteOid })
        .lean(),
      this.observationModel
        .findOne({ _id: this.oid(dto.bId, 'observation id'), siteId: siteOid })
        .lean(),
    ]);
    if (!a || !b) throw new NotFoundException('Observation not found');

    const meanA = a.stats?.mean ?? null;
    const meanB = b.stats?.mean ?? null;
    const delta =
      meanA != null && meanB != null ? Number((meanB - meanA).toFixed(4)) : null;

    const warnA = this.coverageWarning(a);
    const warnB = this.coverageWarning(b);

    const drop = delta != null ? -delta : null;
    const inspectFlag = delta != null && delta <= -NDVI_DROP_FLAG;
    const inspect = {
      flag: inspectFlag,
      threshold: NDVI_DROP_FLAG,
      reason: inspectFlag
        ? `Mean NDVI dropped by ${Math.abs(delta!).toFixed(3)} (≥ ${NDVI_DROP_FLAG})`
        : 'No inspect threshold crossed',
      evidence: [
        `Earlier ${a.acquiredAt || '?'}: mean NDVI ${meanA?.toFixed(4) ?? '—'} (cloud ${a.cloudCover ?? '—'}%)`,
        `Later ${b.acquiredAt || '?'}: mean NDVI ${meanB?.toFixed(4) ?? '—'} (cloud ${b.cloudCover ?? '—'}%)`,
        `Δ mean NDVI = ${delta ?? '—'} (negative = decline)`,
        warnA.message || warnB.message
          ? `Coverage note: ${[warnA.message, warnB.message].filter(Boolean).join(' · ')}`
          : 'Coverage OK on both dates (≥ 70% valid pixels)',
        inspectFlag
          ? `Rule: drop ≥ ${NDVI_DROP_FLAG} → flag field for ground inspection`
          : `Rule: inspect only if drop ≥ ${NDVI_DROP_FLAG}`,
      ],
    };

    const interpretation = this.buildInterpretation({
      dateA: a.acquiredAt,
      dateB: b.acquiredAt,
      meanA,
      meanB,
      delta,
      drop,
      cloudA: a.cloudCover,
      cloudB: b.cloudCover,
      warnA: warnA.message,
      warnB: warnB.message,
      inspectFlag,
    });

    return {
      siteId,
      a: {
        id: a._id,
        acquiredAt: a.acquiredAt,
        mean: meanA,
        min: a.stats?.min,
        max: a.stats?.max,
        cloudCover: a.cloudCover,
        sceneId: a.sceneId,
        sensor: a.sensor,
        coverage: warnA,
        hasTruecolor: Boolean(a.truecolor?.imageBase64),
        hasNdvi: Boolean(a.overlay?.imageBase64),
      },
      b: {
        id: b._id,
        acquiredAt: b.acquiredAt,
        mean: meanB,
        min: b.stats?.min,
        max: b.stats?.max,
        cloudCover: b.cloudCover,
        sceneId: b.sceneId,
        sensor: b.sensor,
        coverage: warnB,
        hasTruecolor: Boolean(b.truecolor?.imageBase64),
        hasNdvi: Boolean(b.overlay?.imageBase64),
      },
      deltaMeanNdvi: delta,
      provenance: {
        sensor: 'Sentinel-2 L2A',
        provider: 'Microsoft Planetary Computer',
        measurement: 'original multispectral NDVI (not enhanced)',
        display: 'true-color and NDVI overlays are derived visualizations',
      },
      inspect,
      interpretation,
    };
  }

  private buildInterpretation(input: {
    dateA?: string;
    dateB?: string;
    meanA: number | null;
    meanB: number | null;
    delta: number | null;
    drop: number | null;
    cloudA?: number;
    cloudB?: number;
    warnA: string | null;
    warnB: string | null;
    inspectFlag: boolean;
  }) {
    const lines: string[] = [];
    lines.push(
      `From ${input.dateA || 'earlier'} to ${input.dateB || 'later'}, mean field NDVI went from ${
        input.meanA?.toFixed(3) ?? '—'
      } to ${input.meanB?.toFixed(3) ?? '—'} (Δ ${input.delta ?? '—'}).`,
    );
    lines.push(
      `Scene cloud cover: ${input.cloudA ?? '—'}% → ${input.cloudB ?? '—'}%.`,
    );
    if (input.warnA || input.warnB) {
      lines.push(
        `Coverage caution: ${[input.warnA, input.warnB].filter(Boolean).join(' ')}`,
      );
    } else {
      lines.push('Valid-pixel coverage was adequate on both dates.');
    }
    if (input.inspectFlag) {
      lines.push(
        `INSPECT suggested: mean NDVI decline meets the ${NDVI_DROP_FLAG} rule — prioritize a ground check before changing irrigation.`,
      );
    } else if (input.delta != null && input.delta < 0) {
      lines.push(
        'Decline is below the inspect threshold; keep monitoring on the next clear scene.',
      );
    } else if (input.delta != null && input.delta > 0) {
      lines.push(
        'Mean NDVI increased between these dates; no inspect flag from the drop rule.',
      );
    } else {
      lines.push('Not enough NDVI means to evaluate change.');
    }
    return {
      label: 'What this means for your field',
      text: lines.join(' '),
      factsOnly: true,
      honesty:
        'Generated from structured NDVI stats and rules — not a medical or agronomic diagnosis.',
    };
  }

  private reportEsc(s: unknown) {
    return String(s ?? '—')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  private reportNum(n: number | null | undefined, digits = 3) {
    if (n == null || !Number.isFinite(n)) return '—';
    return n.toFixed(digits);
  }

  /** Horizontal NDVI mean comparison (0–1 scale). */
  private reportNdviBars(
    meanA: number | null | undefined,
    meanB: number | null | undefined,
    dateA?: string,
    dateB?: string,
  ) {
    const scale = (v: number | null | undefined) => {
      if (v == null || !Number.isFinite(v)) return 0;
      return Math.max(0, Math.min(100, (v / 1) * 100));
    };
    const aW = scale(meanA);
    const bW = scale(meanB);
    const esc = (s: unknown) => this.reportEsc(s);
    return `<svg class="chart" viewBox="0 0 420 128" role="img" aria-label="NDVI mean comparison">
  <text x="0" y="18" class="chart-title">Plant greenness (NDVI mean)</text>
  <text x="0" y="48" class="chart-label">${esc(dateA || 'Earlier')}</text>
  <rect x="110" y="34" width="280" height="18" rx="9" class="chart-track"/>
  <rect x="110" y="34" width="${aW * 2.8}" height="18" rx="9" class="chart-fill-a"/>
  <text x="400" y="48" text-anchor="end" class="chart-value">${esc(this.reportNum(meanA, 3))}</text>
  <text x="0" y="88" class="chart-label">${esc(dateB || 'Later')}</text>
  <rect x="110" y="74" width="280" height="18" rx="9" class="chart-track"/>
  <rect x="110" y="74" width="${bW * 2.8}" height="18" rx="9" class="chart-fill-b"/>
  <text x="400" y="88" text-anchor="end" class="chart-value">${esc(this.reportNum(meanB, 3))}</text>
  <text x="110" y="118" class="chart-axis">0</text>
  <text x="250" y="118" text-anchor="middle" class="chart-axis">0.5</text>
  <text x="390" y="118" text-anchor="end" class="chart-axis">1.0</text>
</svg>`;
  }

  /** Delta gauge on −0.3 … +0.3. */
  private reportDeltaGauge(delta: number | null | undefined) {
    const d = delta == null || !Number.isFinite(delta) ? null : delta;
    const clamped = d == null ? 0 : Math.max(-0.3, Math.min(0.3, d));
    const x = 40 + ((clamped + 0.3) / 0.6) * 340;
    const tone =
      d == null ? 'neutral' : d <= -0.08 ? 'bad' : d < 0 ? 'warn' : 'good';
    const label =
      d == null
        ? '—'
        : `${d > 0 ? '+' : ''}${d.toFixed(3)}`;
    return `<svg class="chart gauge" viewBox="0 0 420 100" role="img" aria-label="NDVI change">
  <text x="0" y="18" class="chart-title">Change in greenness (later − earlier)</text>
  <rect x="40" y="42" width="340" height="14" rx="7" class="chart-track"/>
  <rect x="40" y="42" width="170" height="14" rx="0" class="gauge-neg"/>
  <rect x="210" y="42" width="170" height="14" rx="0" class="gauge-pos"/>
  <line x1="210" y1="36" x2="210" y2="62" class="gauge-zero"/>
  <circle cx="${x}" cy="49" r="9" class="gauge-knob gauge-${tone}"/>
  <text x="40" y="80" class="chart-axis">−0.3</text>
  <text x="210" y="80" text-anchor="middle" class="chart-axis">0</text>
  <text x="380" y="80" text-anchor="end" class="chart-axis">+0.3</text>
  <text x="400" y="54" text-anchor="end" class="chart-value gauge-${tone}">${this.reportEsc(label)}</text>
</svg>`;
  }

  /** Min / mean / max range for one date. */
  private reportRangeBars(
    title: string,
    min?: number | null,
    mean?: number | null,
    max?: number | null,
  ) {
    const row = (label: string, v: number | null | undefined, cls: string) => {
      const w =
        v == null || !Number.isFinite(v)
          ? 0
          : Math.max(0, Math.min(100, v * 100));
      return `<div class="range-row">
  <span>${this.reportEsc(label)}</span>
  <div class="range-track"><div class="range-fill ${cls}" style="width:${w}%"></div></div>
  <strong>${this.reportEsc(this.reportNum(v, 3))}</strong>
</div>`;
    };
    return `<div class="card range-card">
  <h4>${this.reportEsc(title)}</h4>
  ${row('Min', min, 'r-min')}
  ${row('Mean', mean, 'r-mean')}
  ${row('Max', max, 'r-max')}
</div>`;
  }

  private reportCloudBars(
    cloudA?: number | null,
    cloudB?: number | null,
    dateA?: string,
    dateB?: string,
  ) {
    const w = (v?: number | null) =>
      v == null || !Number.isFinite(v) ? 0 : Math.max(0, Math.min(100, v));
    return `<svg class="chart" viewBox="0 0 420 110" role="img" aria-label="Cloud cover comparison">
  <text x="0" y="18" class="chart-title">Cloud cover on scene day</text>
  <text x="0" y="48" class="chart-label">${this.reportEsc(dateA || 'Earlier')}</text>
  <rect x="110" y="34" width="280" height="18" rx="9" class="chart-track"/>
  <rect x="110" y="34" width="${w(cloudA) * 2.8}" height="18" rx="9" class="chart-fill-cloud"/>
  <text x="400" y="48" text-anchor="end" class="chart-value">${this.reportEsc(cloudA != null ? `${cloudA}%` : '—')}</text>
  <text x="0" y="88" class="chart-label">${this.reportEsc(dateB || 'Later')}</text>
  <rect x="110" y="74" width="280" height="18" rx="9" class="chart-track"/>
  <rect x="110" y="74" width="${w(cloudB) * 2.8}" height="18" rx="9" class="chart-fill-cloud"/>
  <text x="400" y="88" text-anchor="end" class="chart-value">${this.reportEsc(cloudB != null ? `${cloudB}%` : '—')}</text>
</svg>`;
  }

  async listReports(siteId: string) {
    await this.findOne(siteId);
    return this.reportModel
      .find({ siteId: this.oid(siteId, 'site id') })
      .sort({ updatedAt: -1 })
      .select('-html')
      .lean();
  }

  async getSavedReportHtml(
    siteId: string,
    reportId: string,
    opts: { print?: boolean } = {},
  ) {
    await this.findOne(siteId);
    const report = await this.reportModel
      .findOne({
        _id: this.oid(reportId, 'report id'),
        siteId: this.oid(siteId, 'site id'),
      })
      .lean();
    if (!report) throw new NotFoundException('Report not found');
    return this.withPrintChrome(report.html, opts.print);
  }

  /** Farmer can Save as PDF via browser print dialog. */
  private withPrintChrome(html: string, autoPrint = false) {
    if (html.includes('data-sakiya-print')) {
      if (autoPrint && !html.includes('data-sakiya-autoprint')) {
        return html.replace(
          '</body>',
          `<script data-sakiya-autoprint>window.addEventListener('load',()=>setTimeout(()=>window.print(),400));</script></body>`,
        );
      }
      return html;
    }
    const chrome = `
<style data-sakiya-print>
  .print-bar {
    position: sticky; top: 0; z-index: 20;
    display: flex; gap: .6rem; align-items: center; flex-wrap: wrap;
    margin: -2rem -2rem 1.25rem; padding: .85rem 1.1rem;
    background: #102018; color: #e7f0e8;
    border-bottom: 1px solid rgba(120,150,128,.35);
  }
  .print-bar button, .print-bar .hint {
    font: inherit;
  }
  .print-bar button {
    background: #2f9e44; color: #fff; border: 0; border-radius: 8px;
    padding: .55rem .9rem; font-weight: 650; cursor: pointer;
  }
  .print-bar .hint { color: #9eb3a3; font-size: .85rem; }
  @media print {
    .print-bar { display: none !important; }
    body { margin: 1rem; }
    .grid { break-inside: avoid; }
    .card { break-inside: avoid; }
  }
</style>
<div class="print-bar" data-sakiya-print>
  <button type="button" onclick="window.print()">Save as PDF</button>
  <span class="hint">Choose “Save as PDF” / “Microsoft Print to PDF” in the print dialog.</span>
</div>
${
  autoPrint
    ? `<script data-sakiya-autoprint>window.addEventListener('load',()=>setTimeout(()=>window.print(),400));</script>`
    : ''
}`;
    if (html.includes('</body>')) {
      return html.replace('</body>', `${chrome}</body>`);
    }
    return `${html}${chrome}`;
  }

  async reportHtml(
    siteId: string,
    aId: string,
    bId: string,
    opts: { print?: boolean } = {},
  ) {
    const { html } = await this.buildAndSaveReport(siteId, aId, bId);
    return this.withPrintChrome(html, opts.print);
  }

  /** Build compare HTML, upsert into Mongo, return html + report id. */
  async buildAndSaveReport(siteId: string, aId: string, bId: string) {
    const site = await this.findOne(siteId);
    const cmp = await this.compare(siteId, { aId, bId });
    const toDataUrl = async (obsId: string, kind: 'ndvi' | 'truecolor') => {
      try {
        const buf = await this.getObservationImage(siteId, obsId, kind);
        return `data:image/png;base64,${buf.toString('base64')}`;
      } catch {
        return null;
      }
    };
    const imgA = {
      truecolor: await toDataUrl(aId, 'truecolor'),
      ndvi: await toDataUrl(aId, 'ndvi'),
    };
    const imgB = {
      truecolor: await toDataUrl(bId, 'truecolor'),
      ndvi: await toDataUrl(bId, 'ndvi'),
    };
    const esc = (s: unknown) => this.reportEsc(s);
    const delta = cmp.deltaMeanNdvi as number | null;
    const deltaLabel =
      delta == null
        ? '—'
        : `${delta > 0 ? '+' : ''}${Number(delta).toFixed(3)}`;
    const deltaTone =
      delta == null ? 'neutral' : delta <= -0.08 ? 'bad' : delta < 0 ? 'warn' : 'good';
    const actionLabel = cmp.inspect.flag
      ? 'Check the field'
      : delta != null && delta < 0
        ? 'Keep watching'
        : 'Looking stable';
    const interpHonesty =
      (cmp.interpretation as { honesty?: string })?.honesty ||
      'Generated from structured NDVI stats and rules — not a diagnosis.';

    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>SAKIYA report — ${esc(site.name)}</title>
  <style>
    :root {
      --bg: #f4f7f4;
      --card: #fff;
      --text: #14241a;
      --muted: #4a6354;
      --line: rgba(40,70,50,.14);
      --accent: #2f9e44;
      --accent-soft: #e7f6ea;
      --warn: #9a5b00;
      --bad: #a13d1a;
      --good: #176b2c;
      --shadow: 0 14px 36px rgba(20,40,28,.1);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", system-ui, sans-serif;
      color: var(--text);
      background:
        radial-gradient(900px 420px at 10% -10%, rgba(47,158,68,.12), transparent 55%),
        var(--bg);
      line-height: 1.45;
    }
    .wrap { max-width: 980px; margin: 0 auto; padding: 1.25rem 1.25rem 2.5rem; }
    .print-bar {
      position: sticky; top: 0; z-index: 20;
      display: flex; gap: .65rem; align-items: center; flex-wrap: wrap;
      margin: 0 0 1.25rem; padding: .85rem 1rem;
      background: #102018; color: #e7f0e8;
      border-radius: 12px;
    }
    .print-bar button {
      background: var(--accent); color: #fff; border: 0; border-radius: 8px;
      padding: .55rem .95rem; font-weight: 650; cursor: pointer;
    }
    .print-bar span { color: #9eb3a3; font-size: .85rem; }
    .hero {
      display: grid; gap: 1rem;
      grid-template-columns: 1.4fr .9fr;
      margin-bottom: 1.1rem;
    }
    .hero-main, .hero-side, .card, .ai-card {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 16px;
      box-shadow: var(--shadow);
    }
    .hero-main { padding: 1.25rem 1.35rem; }
    .eyebrow {
      margin: 0 0 .35rem;
      font-size: .72rem; font-weight: 700; letter-spacing: .1em;
      text-transform: uppercase; color: var(--accent);
    }
    h1 { margin: 0; font-size: clamp(1.5rem, 3vw, 2rem); letter-spacing: -.03em; }
    .sub { margin: .4rem 0 0; color: var(--muted); }
    .kpis {
      display: grid; grid-template-columns: repeat(3, 1fr); gap: .65rem;
      margin-top: 1rem;
    }
    .kpi {
      padding: .75rem .8rem; border-radius: 12px;
      background: #f7faf7; border: 1px solid var(--line);
    }
    .kpi span { display: block; font-size: .72rem; color: var(--muted); font-weight: 650; }
    .kpi strong { display: block; margin-top: .2rem; font-size: 1.2rem; font-variant-numeric: tabular-nums; }
    .kpi.tone-good strong { color: var(--good); }
    .kpi.tone-warn strong { color: var(--warn); }
    .kpi.tone-bad strong { color: var(--bad); }
    .hero-side { padding: 1.1rem 1.15rem; display: flex; flex-direction: column; justify-content: center; gap: .55rem; }
    .status-pill {
      display: inline-flex; align-items: center; gap: .4rem;
      width: fit-content; padding: .4rem .7rem; border-radius: 999px;
      font-weight: 750; font-size: .85rem;
    }
    .status-pill.good { background: #e5f6ea; color: var(--good); }
    .status-pill.warn { background: #fff1d6; color: var(--warn); }
    .status-pill.bad { background: #fde8e1; color: var(--bad); }
    .status-pill.neutral { background: #eef2ef; color: var(--muted); }
    .hero-side p { margin: 0; color: var(--muted); font-size: .9rem; }
    .ai-card {
      margin-bottom: 1.1rem; padding: 1.15rem 1.25rem;
      border-color: rgba(47,158,68,.28);
      background: linear-gradient(160deg, #f3fbf5, #fff 55%);
    }
    .ai-card h2 { margin: 0 0 .45rem; font-size: 1.15rem; }
    .ai-card .lead { margin: 0; font-size: 1.02rem; color: var(--text); }
    .ai-meta {
      margin: .75rem 0 0; padding: .55rem .7rem; border-radius: 10px;
      background: rgba(47,158,68,.08); color: var(--muted); font-size: .8rem;
    }
    .evidence { margin: .85rem 0 0; padding: 0; list-style: none; display: grid; gap: .4rem; }
    .evidence li {
      display: grid; grid-template-columns: 18px 1fr; gap: .45rem;
      padding: .55rem .65rem; border-radius: 10px; background: #f7faf7;
      border: 1px solid var(--line); font-size: .88rem;
    }
    .evidence li::before { content: "•"; color: var(--accent); font-weight: 800; }
    .section { margin: 1.15rem 0; }
    .section h2 { margin: 0 0 .7rem; font-size: 1.05rem; }
    .charts {
      display: grid; grid-template-columns: 1fr 1fr; gap: .85rem;
    }
    .chart-card { padding: .9rem 1rem; }
    .chart { width: 100%; height: auto; display: block; }
    .chart-title { fill: var(--muted); font-size: 12px; font-weight: 700; }
    .chart-label { fill: var(--text); font-size: 11px; font-weight: 650; }
    .chart-value { fill: var(--text); font-size: 12px; font-weight: 750; }
    .chart-axis { fill: #7a8b80; font-size: 10px; }
    .chart-track { fill: #e7eee8; }
    .chart-fill-a { fill: #7dbe8a; }
    .chart-fill-b { fill: #2f9e44; }
    .chart-fill-cloud { fill: #6b8cae; }
    .gauge-neg { fill: rgba(161,61,26,.18); }
    .gauge-pos { fill: rgba(47,158,68,.18); }
    .gauge-zero { stroke: #8aa090; stroke-width: 1.5; }
    .gauge-knob { fill: #2f9e44; stroke: #fff; stroke-width: 2; }
    .gauge-knob.gauge-bad { fill: var(--bad); }
    .gauge-knob.gauge-warn { fill: #d08900; }
    .gauge-knob.gauge-neutral { fill: #7a8b80; }
    .chart-value.gauge-bad { fill: var(--bad); }
    .chart-value.gauge-warn { fill: var(--warn); }
    .chart-value.gauge-good { fill: var(--good); }
    .ranges { display: grid; grid-template-columns: 1fr 1fr; gap: .85rem; margin-top: .85rem; }
    .range-card { padding: .9rem 1rem; }
    .range-card h4 { margin: 0 0 .65rem; font-size: .88rem; }
    .range-row {
      display: grid; grid-template-columns: 48px 1fr 52px;
      gap: .5rem; align-items: center; margin-bottom: .4rem;
      font-size: .8rem;
    }
    .range-track { height: 10px; border-radius: 999px; background: #e7eee8; overflow: hidden; }
    .range-fill { height: 100%; border-radius: 999px; }
    .range-fill.r-min { background: #c4a35a; }
    .range-fill.r-mean { background: #2f9e44; }
    .range-fill.r-max { background: #1f6b35; }
    .range-row strong { text-align: right; font-variant-numeric: tabular-nums; }
    .scenes { display: grid; grid-template-columns: 1fr 1fr; gap: .85rem; }
    .scene { padding: 1rem; }
    .scene h3 { margin: 0 0 .35rem; font-size: 1rem; }
    .scene .meta { margin: 0 0 .75rem; color: var(--muted); font-size: .85rem; }
    .scene .stats {
      display: grid; grid-template-columns: repeat(3, 1fr); gap: .4rem;
      margin-bottom: .75rem;
    }
    .scene .stats div {
      padding: .45rem .5rem; border-radius: 9px; background: #f7faf7;
      border: 1px solid var(--line); text-align: center;
    }
    .scene .stats span { display: block; font-size: .68rem; color: var(--muted); font-weight: 650; }
    .scene .stats strong { font-size: .92rem; font-variant-numeric: tabular-nums; }
    .media { display: grid; gap: .65rem; }
    .media figure { margin: 0; }
    .media figcaption {
      margin: 0 0 .3rem; font-size: .72rem; font-weight: 700;
      letter-spacing: .06em; text-transform: uppercase; color: var(--muted);
    }
    img {
      width: 100%; border-radius: 10px; background: #111; display: block;
      border: 1px solid var(--line);
    }
    .warn { color: var(--warn); font-size: .85rem; }
    footer.report-foot {
      margin-top: 1.25rem; padding: .9rem 1rem; border-radius: 12px;
      border: 1px solid var(--line); background: #fff;
      color: var(--muted); font-size: .8rem;
    }
    @media (max-width: 800px) {
      .hero, .charts, .ranges, .scenes { grid-template-columns: 1fr; }
      .kpis { grid-template-columns: 1fr; }
    }
    @media print {
      .print-bar { display: none !important; }
      body { background: #fff; }
      .hero-main, .hero-side, .card, .ai-card, .scene, .chart-card, .range-card {
        box-shadow: none; break-inside: avoid;
      }
      .wrap { padding: .5rem; max-width: none; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="print-bar" data-sakiya-print>
      <button type="button" onclick="window.print()">Save as PDF</button>
      <span>Choose “Save as PDF” in the print dialog.</span>
    </div>

    <header class="hero">
      <div class="hero-main">
        <p class="eyebrow">SAKIYA field report</p>
        <h1>${esc(site.name)}</h1>
        <p class="sub">Comparing ${esc(cmp.a.acquiredAt)} → ${esc(cmp.b.acquiredAt)} · Sentinel-2 via Planetary Computer</p>
        <div class="kpis">
          <div class="kpi">
            <span>Earlier greenness</span>
            <strong>${esc(this.reportNum(cmp.a.mean, 3))}</strong>
          </div>
          <div class="kpi">
            <span>Later greenness</span>
            <strong>${esc(this.reportNum(cmp.b.mean, 3))}</strong>
          </div>
          <div class="kpi tone-${deltaTone}">
            <span>Change (Δ NDVI)</span>
            <strong>${esc(deltaLabel)}</strong>
          </div>
        </div>
      </div>
      <aside class="hero-side">
        <div class="status-pill ${cmp.inspect.flag ? 'bad' : deltaTone}">${esc(actionLabel)}</div>
        <p>${cmp.inspect.flag ? esc(cmp.inspect.reason) : 'Use the charts and scene photos below to confirm what changed between the two clear days.'}</p>
      </aside>
    </header>

    <section class="ai-card">
      <p class="eyebrow">AI interpretation</p>
      <h2>${esc(cmp.interpretation.label)}</h2>
      <p class="lead">${esc(cmp.interpretation.text)}</p>
      <p class="ai-meta">${esc(interpHonesty)}</p>
      ${(cmp.inspect.evidence || []).length
        ? `<ul class="evidence">${(cmp.inspect.evidence || [])
            .map((e: string) => `<li>${esc(e)}</li>`)
            .join('')}</ul>`
        : ''}
    </section>

    <section class="section">
      <h2>Diagrams</h2>
      <div class="charts">
        <div class="card chart-card">
          ${this.reportNdviBars(cmp.a.mean, cmp.b.mean, cmp.a.acquiredAt, cmp.b.acquiredAt)}
        </div>
        <div class="card chart-card">
          ${this.reportDeltaGauge(delta)}
        </div>
        <div class="card chart-card" style="grid-column:1/-1">
          ${this.reportCloudBars(cmp.a.cloudCover, cmp.b.cloudCover, cmp.a.acquiredAt, cmp.b.acquiredAt)}
        </div>
      </div>
      <div class="ranges">
        ${this.reportRangeBars(`Earlier range · ${cmp.a.acquiredAt || 'A'}`, cmp.a.min, cmp.a.mean, cmp.a.max)}
        ${this.reportRangeBars(`Later range · ${cmp.b.acquiredAt || 'B'}`, cmp.b.min, cmp.b.mean, cmp.b.max)}
      </div>
    </section>

    <section class="section">
      <h2>Scene evidence</h2>
      <div class="scenes">
        <article class="card scene">
          <h3>Earlier · ${esc(cmp.a.acquiredAt)}</h3>
          <p class="meta">${esc(cmp.a.sensor)} · cloud ${esc(cmp.a.cloudCover)}% · ${esc(cmp.a.sceneId)}</p>
          <div class="stats">
            <div><span>Mean</span><strong>${esc(this.reportNum(cmp.a.mean, 3))}</strong></div>
            <div><span>Min</span><strong>${esc(this.reportNum(cmp.a.min, 3))}</strong></div>
            <div><span>Max</span><strong>${esc(this.reportNum(cmp.a.max, 3))}</strong></div>
          </div>
          ${cmp.a.coverage.message ? `<p class="warn">${esc(cmp.a.coverage.message)}</p>` : ''}
          <div class="media">
            <figure>
              <figcaption>Natural look</figcaption>
              ${imgA.truecolor ? `<img src="${imgA.truecolor}" alt="True color earlier" />` : '<p class="warn">No true-color stored</p>'}
            </figure>
            <figure>
              <figcaption>Greenness map</figcaption>
              ${imgA.ndvi ? `<img src="${imgA.ndvi}" alt="NDVI earlier" />` : '<p class="warn">No NDVI overlay stored</p>'}
            </figure>
          </div>
        </article>
        <article class="card scene">
          <h3>Later · ${esc(cmp.b.acquiredAt)}</h3>
          <p class="meta">${esc(cmp.b.sensor)} · cloud ${esc(cmp.b.cloudCover)}% · ${esc(cmp.b.sceneId)}</p>
          <div class="stats">
            <div><span>Mean</span><strong>${esc(this.reportNum(cmp.b.mean, 3))}</strong></div>
            <div><span>Min</span><strong>${esc(this.reportNum(cmp.b.min, 3))}</strong></div>
            <div><span>Max</span><strong>${esc(this.reportNum(cmp.b.max, 3))}</strong></div>
          </div>
          ${cmp.b.coverage.message ? `<p class="warn">${esc(cmp.b.coverage.message)}</p>` : ''}
          <div class="media">
            <figure>
              <figcaption>Natural look</figcaption>
              ${imgB.truecolor ? `<img src="${imgB.truecolor}" alt="True color later" />` : '<p class="warn">No true-color stored</p>'}
            </figure>
            <figure>
              <figcaption>Greenness map</figcaption>
              ${imgB.ndvi ? `<img src="${imgB.ndvi}" alt="NDVI later" />` : '<p class="warn">No NDVI overlay stored</p>'}
            </figure>
          </div>
        </article>
      </div>
    </section>

    <footer class="report-foot">
      Provenance: ${esc(cmp.provenance.provider)} · ${esc(cmp.provenance.sensor)} ·
      ${esc(cmp.provenance.measurement)}. ${esc(cmp.provenance.display)}.
    </footer>
  </div>
</body>
</html>`;

    const title = `${site.name}: ${cmp.a.acquiredAt || 'A'} → ${cmp.b.acquiredAt || 'B'}`;
    const saved = await this.reportModel
      .findOneAndUpdate(
        {
          siteId: this.oid(siteId, 'site id'),
          observationAId: this.oid(aId, 'observation A'),
          observationBId: this.oid(bId, 'observation B'),
        },
        {
          $set: {
            title,
            dateA: cmp.a.acquiredAt,
            dateB: cmp.b.acquiredAt,
            deltaMeanNdvi: cmp.deltaMeanNdvi,
            inspectFlag: Boolean(cmp.inspect?.flag),
            inspectReason: cmp.inspect?.reason,
            interpretation: cmp.interpretation?.text,
            html,
          },
        },
        { upsert: true, new: true },
      )
      .lean();

    return {
      html,
      reportId: String(saved?._id || ''),
      title,
    };
  }

  private parseCloud(cloud: unknown): number | undefined {
    if (typeof cloud === 'number') return cloud;
    if (typeof cloud === 'string') {
      const n = Number.parseFloat(cloud.replace('%', ''));
      return Number.isFinite(n) ? n : undefined;
    }
    return undefined;
  }
}
