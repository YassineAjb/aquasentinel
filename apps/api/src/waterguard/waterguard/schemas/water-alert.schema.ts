import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
export type WaterAlertDocument = HydratedDocument<WaterAlert>;
@Schema({ timestamps: true })
export class WaterAlert {
  @Prop({ required: true, index: true }) siteId!: string;
  @Prop({ required: true }) type!: string;
  @Prop({ required: true }) severity!: string;
  @Prop({ required: true }) expectedFlow!: number;
  @Prop({ required: true }) measuredFlow!: number;
  @Prop({ required: true }) excessPercentage!: number;
  @Prop({ required: true }) estimatedLossLiters!: number;
  @Prop({ default: 'ACTIVE' }) status!: string;
  @Prop({ required: true }) explanation!: string;
  @Prop({ type: Date, default: Date.now }) createdAt!: Date;
  @Prop({ type: Date, default: null }) resolvedAt!: Date | null;
}
export const WaterAlertSchema = SchemaFactory.createForClass(WaterAlert);
WaterAlertSchema.index({ siteId: 1, createdAt: -1 });
