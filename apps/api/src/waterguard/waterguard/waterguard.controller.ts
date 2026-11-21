import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { WaterGuardService } from './waterguard.service';
@Controller('waterguard')
export class WaterGuardController {
  constructor(private readonly service: WaterGuardService) {}
  @Post(':siteId/start') start(@Param('siteId') siteId: string, @Body() body: { expectedFlow?: number }) { return this.service.start(siteId, body?.expectedFlow ?? 18); }
  @Post(':siteId/simulate') simulate(@Param('siteId') siteId: string, @Body() body: { scenario: 'NORMAL' | 'SLOW_LEAK' | 'MAJOR_LEAK' | 'OFF' }) { return this.service.simulate(siteId, body.scenario); }
  @Post(':siteId/stop') stop(@Param('siteId') siteId: string) { return this.service.stop(siteId); }
  @Get(':siteId/live') live(@Param('siteId') siteId: string) { return this.service.live(siteId); }
  @Get(':siteId/history') history(@Param('siteId') siteId: string, @Query('limit') limit?: string) { return this.service.history(siteId, Number(limit) || 100); }
  @Get(':siteId/alerts') alerts(@Param('siteId') siteId: string) { return this.service.listAlerts(siteId); }
  @Patch('alerts/:alertId/resolve') resolve(@Param('alertId') alertId: string) { return this.service.resolveAlert(alertId); }
}
