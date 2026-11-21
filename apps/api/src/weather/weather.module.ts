import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Site, SiteSchema } from '../sites/schemas/site.schema';
import {
  WeatherCache,
  WeatherCacheSchema,
} from './schemas/weather-cache.schema';
import { WeatherService } from './weather.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WeatherCache.name, schema: WeatherCacheSchema },
      { name: Site.name, schema: SiteSchema },
    ]),
  ],
  providers: [WeatherService],
  exports: [WeatherService],
})
export class WeatherModule {}
