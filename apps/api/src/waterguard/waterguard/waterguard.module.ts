import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WaterGuardController } from './waterguard.controller';
import { WaterGuardService } from './waterguard.service';
import {
  WaterGuardState,
  WaterGuardStateSchema,
} from './schemas/waterguard-state.schema';
import {
  WaterMeasurement,
  WaterMeasurementSchema,
} from './schemas/water-measurement.schema';
import { WaterAlert, WaterAlertSchema } from './schemas/water-alert.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WaterGuardState.name, schema: WaterGuardStateSchema },
      { name: WaterMeasurement.name, schema: WaterMeasurementSchema },
      { name: WaterAlert.name, schema: WaterAlertSchema },
    ]),
  ],
  controllers: [WaterGuardController],
  providers: [WaterGuardService],
  exports: [WaterGuardService],
})
export class WaterGuardModule {}
