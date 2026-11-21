import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
export type WaterMeasurementDocument = HydratedDocument<WaterMeasurement>;

@Schema({ timestamps: true })
export class WaterMeasurement {
  @Prop({ required: true, index: true }) siteId!: string;
  @Prop({ required: true }) flowRate!: number;
  @Prop({ required: true }) expectedFlow!: number;
  @Prop({ required: true }) volumeLiters!: number;
  @Prop({ required: true }) estimatedLossLiters!: number;
  @Prop({ required: true }) irrigationActive!: boolean;
  @Prop({ required: true }) scenario!: string;
  @Prop({ required: true }) status!: string;
  @Prop({ type: Date, default: Date.now, index: true }) timestamp!: Date;
}
export const WaterMeasurementSchema = SchemaFactory.createForClass(WaterMeasurement);
WaterMeasurementSchema.index({ siteId: 1, timestamp: -1 });
