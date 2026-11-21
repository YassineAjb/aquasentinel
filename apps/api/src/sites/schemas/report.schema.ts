import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ReportDocument = HydratedDocument<Report>;

@Schema({ timestamps: true })
export class Report {
  @Prop({ type: Types.ObjectId, ref: 'Site', required: true, index: true })
  siteId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Observation', required: true })
  observationAId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Observation', required: true })
  observationBId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop()
  dateA?: string;

  @Prop()
  dateB?: string;

  @Prop({ type: Number, default: null })
  deltaMeanNdvi!: number | null;

  @Prop({ default: false })
  inspectFlag!: boolean;

  @Prop()
  inspectReason?: string;

  @Prop()
  interpretation?: string;

  /** Full HTML snapshot (includes embedded thumbs when generated). */
  @Prop({ required: true })
  html!: string;
}

export const ReportSchema = SchemaFactory.createForClass(Report);
ReportSchema.index(
  { siteId: 1, observationAId: 1, observationBId: 1 },
  { unique: true },
);
