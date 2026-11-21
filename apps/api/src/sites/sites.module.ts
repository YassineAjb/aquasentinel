import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IrrigationModule } from '../irrigation/irrigation.module';
import { ScanModule } from '../scan/scan.module';
import { WeatherModule } from '../weather/weather.module';
import { Observation, ObservationSchema } from './schemas/observation.schema';
import { Site, SiteSchema } from './schemas/site.schema';
import { SitesController } from './sites.controller';
import { SitesService } from './sites.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Site.name, schema: SiteSchema },
      { name: Observation.name, schema: ObservationSchema },
    ]),
    ScanModule,
    WeatherModule,
    IrrigationModule,
  ],
  controllers: [SitesController],
  providers: [SitesService],
})
export class SitesModule {}
