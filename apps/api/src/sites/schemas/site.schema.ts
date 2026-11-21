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

  /** Farmer crop profile for irrigation advisor */
  @Prop({ trim: true })
  plantType?: string;

  @Prop({ trim: true })
  plantAge?: string;

  @Prop({ trim: true })
  soilType?: string;
}

export const SiteSchema = SchemaFactory.createForClass(Site);
