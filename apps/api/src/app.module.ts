import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { HealthController } from './health.controller';
import { IrrigationModule } from './irrigation/irrigation.module';
import { ScanModule } from './scan/scan.module';
import { SitesModule } from './sites/sites.module';
import { WeatherModule } from './weather/weather.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.getOrThrow<string>('MONGODB_URI'),
      }),
    }),
    ScanModule,
    SitesModule,
    WeatherModule,
    IrrigationModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
