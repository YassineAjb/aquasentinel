import { handleRequest } from './engine/handler';
import { EngineSession } from './engine/pipeline';
import type { EngineRequest, EngineResponse } from './types';

type Listener = (r: EngineResponse) => void;

/**
 * Talks to the processing engine. Heavy work runs in a Web Worker so the map never freezes.
 * If workers are unavailable the same code runs on the main thread (slower, but functional).
 */
class EngineClient {
  private worker: Worker | null = null;
  private listeners = new Map<number, Listener>();
  private seq = 0;
  private fallback = new EngineSession();
  private fallbackSim = { value: null as ReturnType<EngineSession['simulate']> | null };
  mode: 'worker' | 'main-thread' = 'worker';

  private ensure(): void {
    if (this.worker || this.mode === 'main-thread') return;
    try {
      this.worker = new Worker(new URL('./engine/engine.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (ev: MessageEvent<{ id: number; res: EngineResponse }>) => {
        this.listeners.get(ev.data.id)?.(ev.data.res);
      };
      this.worker.onerror = () => {
        // worker crashed or could not load: fail pending requests explicitly, continue on the main thread
        this.worker = null;
        this.mode = 'main-thread';
        for (const l of [...this.listeners.values()])
          l({
            kind: 'error',
            error: {
              code: 'PROCESSING_FAILED',
              message: 'The processing worker stopped unexpectedly.',
              solution: 'Retry: RainCatch now runs the analysis on the main thread.',
            },
          });
      };
    } catch {
      this.mode = 'main-thread';
    }
  }

  /** Sends a request, resolves with the final (non-progress) response. */
  request(req: EngineRequest, onProgress?: (fraction: number, stage: string) => void, transfer?: Transferable[]): Promise<EngineResponse> {
    this.ensure();
    return new Promise((resolve) => {
      const id = ++this.seq;
      const done: Listener = (res) => {
        if (res.kind === 'progress') {
          onProgress?.(res.fraction, res.stage);
          return;
        }
        this.listeners.delete(id);
        resolve(res);
      };
      this.listeners.set(id, done);
      if (this.worker) this.worker.postMessage({ id, req }, transfer ?? []);
      else void handleRequest(this.fallback, this.fallbackSim, req, done);
    });
  }
}

export const engine = new EngineClient();
