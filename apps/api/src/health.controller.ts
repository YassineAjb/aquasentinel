import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Controller('health')
export class HealthController {
  constructor(
    private readonly config: ConfigService,
    private readonly http: HttpService,
  ) {}

  @Get()
  async check() {
    const pythonUrl = this.config.get<string>(
      'PYTHON_SCAN_URL',
      'http://127.0.0.1:8766',
    );
    let python: { ok: boolean; error?: string } = { ok: false };
    try {
      const res = await firstValueFrom(
        this.http.get(`${pythonUrl}/health`, { timeout: 3000 }),
      );
      python = { ok: Boolean(res.data?.ok) };
    } catch (err) {
      python = {
        ok: false,
        error: err instanceof Error ? err.message : 'unreachable',
      };
    }
    return {
      ok: true,
      service: 'sakiya-api',
      mongo: 'configured',
      python,
    };
  }
}
