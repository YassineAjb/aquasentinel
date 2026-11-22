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
      label: 'Generated interpretation (rules from structured stats — not a diagnosis)',
      text: lines.join(' '),
      factsOnly: true,
    };
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
    const esc = (s: unknown) =>
      String(s ?? '—')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>SAKIYA report — ${esc(site.name)}</title>
  <style>
    body { font-family: Segoe UI, system-ui, sans-serif; margin: 2rem; color: #122; }
    h1 { margin: 0 0 .25rem; }
    .sub { color: #456; margin-bottom: 1.25rem; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    .card { border: 1px solid #ccd; border-radius: 10px; padding: 1rem; }
    img { max-width: 100%; border-radius: 8px; background: #111; }
    .meta { font-size: .9rem; line-height: 1.5; }
    .delta { font-size: 1.2rem; font-weight: 700; margin: 1rem 0; }
    .warn { color: #a60; }
    .flag { color: #a20; font-weight: 700; }
    footer { margin-top: 1.5rem; font-size: .8rem; color: #678; }
    @media print {
      .print-bar { display: none !important; }
      body { margin: 1rem; }
      .card { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="print-bar" data-sakiya-print style="position:sticky;top:0;z-index:20;display:flex;gap:.6rem;align-items:center;flex-wrap:wrap;margin:-2rem -2rem 1.25rem;padding:.85rem 1.1rem;background:#102018;color:#e7f0e8;border-bottom:1px solid rgba(120,150,128,.35)">
    <button type="button" onclick="window.print()" style="background:#2f9e44;color:#fff;border:0;border-radius:8px;padding:.55rem .9rem;font-weight:650;cursor:pointer">Save as PDF</button>
    <span style="color:#9eb3a3;font-size:.85rem">Choose “Save as PDF” in the print dialog.</span>
  </div>
  <h1>SAKIYA monitoring report</h1>
  <p class="sub">${esc(site.name)} · Sentinel-2 via Planetary Computer</p>
  <p class="delta">Δ mean NDVI (later − earlier): ${esc(cmp.deltaMeanNdvi)}
    ${cmp.inspect.flag ? `<span class="flag"> · INSPECT: ${esc(cmp.inspect.reason)}</span>` : ''}
  </p>
  <div class="card" style="margin-bottom:1rem">
    <h2>${esc(cmp.interpretation.label)}</h2>
    <p class="meta">${esc(cmp.interpretation.text)}</p>
    <ul class="meta">
      ${(cmp.inspect.evidence || []).map((e: string) => `<li>${esc(e)}</li>`).join('')}
    </ul>
  </div>
  <div class="grid">
    <div class="card">
      <h2>Earlier — ${esc(cmp.a.acquiredAt)}</h2>
      <p class="meta">
        Sensor: ${esc(cmp.a.sensor)}<br/>
        Cloud: ${esc(cmp.a.cloudCover)}%<br/>
        NDVI mean/min/max: ${esc(cmp.a.mean)} / ${esc(cmp.a.min)} / ${esc(cmp.a.max)}<br/>
        Scene: ${esc(cmp.a.sceneId)}
        ${cmp.a.coverage.message ? `<br/><span class="warn">${esc(cmp.a.coverage.message)}</span>` : ''}
      </p>
      ${imgA.truecolor ? `<p>True color</p><img src="${imgA.truecolor}" alt="truecolor A" />` : '<p class="warn">No true-color stored</p>'}
      ${imgA.ndvi ? `<p>NDVI</p><img src="${imgA.ndvi}" alt="ndvi A" />` : '<p class="warn">No NDVI overlay stored</p>'}
    </div>
    <div class="card">
      <h2>Later — ${esc(cmp.b.acquiredAt)}</h2>
      <p class="meta">
        Sensor: ${esc(cmp.b.sensor)}<br/>
        Cloud: ${esc(cmp.b.cloudCover)}%<br/>
        NDVI mean/min/max: ${esc(cmp.b.mean)} / ${esc(cmp.b.min)} / ${esc(cmp.b.max)}<br/>
        Scene: ${esc(cmp.b.sceneId)}
        ${cmp.b.coverage.message ? `<br/><span class="warn">${esc(cmp.b.coverage.message)}</span>` : ''}
      </p>
      ${imgB.truecolor ? `<p>True color</p><img src="${imgB.truecolor}" alt="truecolor B" />` : '<p class="warn">No true-color stored</p>'}
      ${imgB.ndvi ? `<p>NDVI</p><img src="${imgB.ndvi}" alt="ndvi B" />` : '<p class="warn">No NDVI overlay stored</p>'}
    </div>
  </div>
  <footer>
    Provenance: ${esc(cmp.provenance.provider)} · ${esc(cmp.provenance.sensor)} ·
    ${esc(cmp.provenance.measurement)}. ${esc(cmp.provenance.display)}.
  </footer>
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
