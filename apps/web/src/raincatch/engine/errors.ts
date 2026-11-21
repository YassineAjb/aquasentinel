import type { RainCatchError, RainCatchErrorCode } from '../types';

/** Error carrying a user-facing message AND a suggested solution (section 25 of the brief). */
export class RainCatchFailure extends Error {
  info: RainCatchError;
  constructor(code: RainCatchErrorCode, message: string, solution: string) {
    super(message);
    this.name = 'RainCatchFailure';
    this.info = { code, message, solution };
  }
}

export function toRainCatchError(e: unknown, fallback: RainCatchErrorCode = 'PROCESSING_FAILED'): RainCatchError {
  if (e instanceof RainCatchFailure) return e.info;
  const msg = e instanceof Error ? e.message : String(e);
  return {
    code: fallback,
    message: msg,
    solution: 'Try again with another file or the demo terrain. If the problem persists, check the file with QGIS/GDAL.',
  };
}
