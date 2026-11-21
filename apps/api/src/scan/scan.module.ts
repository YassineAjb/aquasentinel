import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ScanService } from './scan.service';

@Module({
  imports: [HttpModule.register({ timeout: 120_000 })],
  providers: [ScanService],
  exports: [ScanService, HttpModule],
})
export class ScanModule {}
