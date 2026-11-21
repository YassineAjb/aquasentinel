import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Observation,
  ObservationSchema,
} from '../sites/schemas/observation.schema';
import { Site, SiteSchema } from '../sites/schemas/site.schema';
import { WeatherModule } from '../weather/weather.module';
import { IrrigationService } from './irrigation.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Site.name, schema: SiteSchema },
      { name: Observation.name, schema: ObservationSchema },
    ]),
    WeatherModule,
  ],
  providers: [IrrigationService],
  exports: [IrrigationService],
})
export class IrrigationModule {}
