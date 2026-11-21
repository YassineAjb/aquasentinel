import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ObservationDocument = HydratedDocument<Observation>;

@Schema({ timestamps: true })
export class Observation {
  @Prop({ type: Types.ObjectId, ref: 'Site', required: true, index: true })
  siteId!: Types.ObjectId;

  @Prop()
  acquiredAt?: string;

  @Prop({ default: 'sentinel-2-l2a' })
  sensor!: string;

  @Prop()
  sceneId?: string;

  @Prop()
  cloudCover?: number;

  @Prop({ type: Object })
  stats?: {
    mean?: number;
    min?: number;
    max?: number;
    validPct?: number;
    validPixels?: number;
  };

  @Prop({ type: Object })
  vegetation?: Record<string, unknown>;

  @Prop({ type: Object })
  overlay?: {
    imageBase64?: string;
    bounds?: number[][];
    opacity?: number;
    label?: string;
  };

  @Prop({ type: Object })
  truecolor?: {
    imageBase64?: string;
    bounds?: number[][];
    opacity?: number;
    label?: string;
  };

  @Prop({ type: Object })
  field?: Record<string, unknown>;

  @Prop({ type: Object })
  raw?: Record<string, unknown>;
}

export const ObservationSchema = SchemaFactory.createForClass(Observation);
