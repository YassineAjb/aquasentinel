import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';

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
  private collName: string | null;

  constructor(@InjectConnection() private readonly conn: Connection, config: ConfigService) {
    this.collName = config.get<string>('REPORTS_COLLECTION') || null;
  }

  /** Trouve tout seul la collection qui contient les rapports (champ observationAId). */
  private async coll() {
    const db = this.conn.db!;
    if (!this.collName) {
      for (const c of await db.listCollections().toArray()) {
        const hit = await db.collection(c.name).findOne({ observationAId: { $exists: true } }, { projection: { _id: 1 } });
        if (hit) { this.collName = c.name; break; }
      }
      if (!this.collName) throw new Error('collection des rapports introuvable : ajoutez REPORTS_COLLECTION dans .env');
    }
    return db.collection(this.collName);
  }

  /** Derniers rapports, pour que l'interface propose un choix. */
  async list(limit = 20) {
    const docs = await (await this.coll())
      .find({}, { projection: { title: 1, dateA: 1, dateB: 1, deltaMeanNdvi: 1, inspectFlag: 1, createdAt: 1 } })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
    return docs.map((d: any) => ({
      id: String(d._id), title: d.title, dateA: d.dateA, dateB: d.dateB,
      deltaMeanNdvi: d.deltaMeanNdvi, inspectFlag: d.inspectFlag,
    }));
  }

  /** Un rapport, réduit à ce qui est utile pour l'assistant (le HTML devient du texte). */
  async get(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new Error('identifiant de rapport invalide');
    const d: any = await (await this.coll()).findOne({ _id: new Types.ObjectId(id) } as any);
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
