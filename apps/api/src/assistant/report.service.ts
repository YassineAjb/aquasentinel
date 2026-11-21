import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Report, ReportDocument } from '../sites/schemas/report.schema';

const htmlToText = (html?: string, max = 3500) =>
  !html
    ? ''
    : html
        .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max);

@Injectable()
export class ReportService {
  constructor(
    @InjectModel(Report.name) private readonly reportModel: Model<ReportDocument>,
  ) {}

  /** Latest saved Mongo reports (same store as Analysis → Saved reports). */
  async list(limit = 20) {
    const docs = await this.reportModel
      .find({})
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(limit)
      .select('title dateA dateB deltaMeanNdvi inspectFlag createdAt updatedAt siteId')
      .lean();
    return docs.map((d) => ({
      _id: String(d._id),
      id: String(d._id),
      title: d.title,
      dateA: d.dateA,
      dateB: d.dateB,
      deltaMeanNdvi: d.deltaMeanNdvi,
      inspectFlag: d.inspectFlag,
      siteId: d.siteId ? String(d.siteId) : undefined,
    }));
  }

  /** Report payload for the assistant (HTML → plain text). */
  async get(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new Error('identifiant de rapport invalide');
    const d = await this.reportModel.findById(id).lean();
    if (!d) throw new Error('rapport introuvable');
    return {
      titre: d.title,
      date_A: d.dateA,
      date_B: d.dateB,
      variation_ndvi_moyen: d.deltaMeanNdvi,
      a_inspecter_sur_le_terrain: d.inspectFlag,
      raison_inspection: d.inspectReason,
      interpretation: d.interpretation,
      details_du_rapport: htmlToText(d.html),
    };
  }
}
