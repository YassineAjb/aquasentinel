import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type WaterGuardStateDocument = HydratedDocument<WaterGuardState>;


@Schema({ timestamps: true })
export class WaterGuardState {
  @Prop({ required: true, unique: true, index: true })
  siteId!: string;

  @Prop({ default: false })
  active!: boolean;

  @Prop({ enum: ['NORMAL', 'SLOW_LEAK', 'MAJOR_LEAK', 'OFF'], default: 'NORMAL' })
  scenario!: string;

  @Prop({ default: 18 })
  expectedFlow!: number;

  @Prop({ default: 0 })
  flowRate!: number;

  @Prop({ default: 0 })
  totalVolumeLiters!: number;

  @Prop({ default: 0 })
  estimatedLossLiters!: number;

  @Prop({ default: 0 })
  consecutiveAnomalies!: number;

  @Prop({ default: 'NORMAL' })
  status!: string;

  @Prop({ type: Date, default: null })
  sessionStartedAt!: Date | null;

  @Prop({ type: Date, default: Date.now })
  lastUpdated!: Date;
}
export const WaterGuardStateSchema = SchemaFactory.createForClass(WaterGuardState);
