import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SiteDocument = HydratedDocument<Site>;

@Schema({ timestamps: true })
export class Site {
  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ type: Object, required: true })
  boundary!: {
    type: 'Polygon';
    coordinates: number[][][];
  };

  @Prop()
  areaM2?: number;
}

export const SiteSchema = SchemaFactory.createForClass(Site);
