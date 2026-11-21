import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type WeatherCacheDocument = HydratedDocument<WeatherCache>;

@Schema({ _id: false })
export class WeatherDay {
  @Prop({ required: true })
  date!: string;

  @Prop({ type: Number, default: null })
  precipMm!: number | null;

  @Prop({ type: Number, default: null })
  tempMeanC!: number | null;

  @Prop({ type: Number, default: null })
  tempMaxC!: number | null;

  @Prop({ type: Number, default: null })
  tempMinC!: number | null;

  @Prop({ type: Number, default: null })
  et0Mm!: number | null;
}

export const WeatherDaySchema = SchemaFactory.createForClass(WeatherDay);

@Schema({ timestamps: true })
export class WeatherCache {
  @Prop({ type: Types.ObjectId, ref: 'Site', required: true, unique: true, index: true })
  siteId!: Types.ObjectId;

  @Prop({ required: true })
  lat!: number;

  @Prop({ required: true })
  lon!: number;

  @Prop({ type: [WeatherDaySchema], default: [] })
  days!: WeatherDay[];

  @Prop({ default: 'Open-Meteo' })
  source!: string;

  @Prop()
  fetchedAt?: Date;
}

export const WeatherCacheSchema = SchemaFactory.createForClass(WeatherCache);
