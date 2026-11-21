import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { CompareDto } from './dto/compare.dto';
import { CreateSiteDto } from './dto/create-site.dto';
import { IrrigationPlanDto } from './dto/irrigation-plan.dto';
import { ScanDto } from './dto/scan.dto';
import { UpdateSiteDto } from './dto/update-site.dto';
import { SitesService } from './sites.service';

@Controller('sites')
export class SitesController {
  constructor(private readonly sitesService: SitesService) {}

  @Post()
  create(@Body() dto: CreateSiteDto) {
    return this.sitesService.create(dto);
  }

  @Get()
  findAll() {
    return this.sitesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.sitesService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSiteDto) {
    return this.sitesService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.sitesService.remove(id);
  }

  @Post(':id/scan')
  scan(@Param('id') id: string, @Body() dto: ScanDto) {
    return this.sitesService.scan(id, dto || {});
  }

  @Get(':id/weather')
  weather(
    @Param('id') id: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('around') around?: string,
    @Query('refresh') refresh?: string,
  ) {
    return this.sitesService.getWeather(id, { from, to, around, refresh });
  }

  @Post(':id/weather/refresh')
  refreshWeather(
    @Param('id') id: string,
    @Body() body: { from?: string; to?: string; around?: string },
  ) {
    return this.sitesService.refreshWeather(id, body || {});
  }

  @Post(':id/irrigation-plan')
  irrigationPlan(@Param('id') id: string, @Body() dto: IrrigationPlanDto) {
    return this.sitesService.irrigationPlan(id, dto || {});
  }

  @Post(':id/pump-windows')
  pumpWindows(@Param('id') id: string, @Body() dto: IrrigationPlanDto) {
    return this.sitesService.pumpWindows(id, dto || {});
  }

  @Get(':id/observations')
  listObservations(@Param('id') id: string) {
    return this.sitesService.listObservations(id);
  }

  @Get(':id/observations/:obsId/image/:kind')
  async observationImage(
    @Param('id') id: string,
    @Param('obsId') obsId: string,
    @Param('kind') kind: 'ndvi' | 'truecolor',
    @Query('variant') variant: string | undefined,
    @Res() res: Response,
  ) {
    const buf = await this.sitesService.getObservationImage(
      id,
      obsId,
      kind === 'truecolor' ? 'truecolor' : 'ndvi',
      variant === 'enhanced' ? 'enhanced' : 'original',
    );
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    if (variant === 'enhanced') {
      res.setHeader('X-AquaSentinel-Visual', 'derived-enhanced');
    }
    res.send(buf);
  }

  @Get(':id/observations/:obsId')
  getObservation(@Param('id') id: string, @Param('obsId') obsId: string) {
    return this.sitesService.getObservation(id, obsId);
  }

  @Post(':id/compare')
  compare(@Param('id') id: string, @Body() dto: CompareDto) {
    return this.sitesService.compare(id, dto);
  }

  @Get(':id/reports')
  listReports(@Param('id') id: string) {
    return this.sitesService.listReports(id);
  }

  @Get(':id/reports/:reportId')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async savedReport(
    @Param('id') id: string,
    @Param('reportId') reportId: string,
    @Query('print') print: string | undefined,
    @Res() res: Response,
  ) {
    const html = await this.sitesService.getSavedReportHtml(id, reportId, {
      print: print === '1' || print === 'true',
    });
    res.send(html);
  }

  @Post(':id/reports')
  async saveReport(@Param('id') id: string, @Body() dto: CompareDto) {
    const saved = await this.sitesService.buildAndSaveReport(
      id,
      dto.aId,
      dto.bId,
    );
    return {
      reportId: saved.reportId,
      title: saved.title,
      url: `/sites/${id}/reports/${saved.reportId}`,
      pdfUrl: `/sites/${id}/reports/${saved.reportId}?print=1`,
    };
  }

  @Get(':id/report')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async report(
    @Param('id') id: string,
    @Query('a') a: string,
    @Query('b') b: string,
    @Query('print') print: string | undefined,
    @Res() res: Response,
  ) {
    const html = await this.sitesService.reportHtml(id, a, b, {
      print: print === '1' || print === 'true',
    });
    res.send(html);
  }
}
