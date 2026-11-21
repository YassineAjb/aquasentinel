import { HttpService } from '@nestjs/axios';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class ScanService {
  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  private baseUrl() {
    return this.config.get<string>(
      'PYTHON_SCAN_URL',
      'http://127.0.0.1:8766',
    );
  }

  async scanPolygon(
    feature: unknown,
    opts?: {
      sceneIndex?: number;
      excludeItemIds?: string[];
      excludeDates?: string[];
      itemId?: string;
    },
  ) {
    try {
      const res = await firstValueFrom(
        this.http.post(`${this.baseUrl()}/api/scan`, {
          feature,
          scene_index: opts?.sceneIndex ?? 0,
          exclude_item_ids: opts?.excludeItemIds ?? [],
          exclude_dates: opts?.excludeDates ?? [],
          item_id: opts?.itemId,
        }),
      );
      if (!res.data?.ok) {
        throw new ServiceUnavailableException(
          res.data?.error || 'Python scan failed',
        );
      }
      return res.data as Record<string, unknown>;
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      const message = err instanceof Error ? err.message : 'Python unreachable';
      throw new ServiceUnavailableException(
        `Analysis service error: ${message}`,
      );
    }
  }
}
