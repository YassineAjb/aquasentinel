/// <reference lib="webworker" />
import type { EngineRequest, EngineResponse } from '../types';
import { handleRequest } from './handler';
import { EngineSession } from './pipeline';

const session = new EngineSession();
const lastSim = { value: null as ReturnType<typeof session.simulate> | null };
const ctx = self as unknown as {
  postMessage: (m: unknown) => void;
  onmessage: ((ev: MessageEvent<{ id: number; req: EngineRequest }>) => void) | null;
};

ctx.onmessage = (ev) => {
  const { id, req } = ev.data;
  void handleRequest(session, lastSim, req, (res: EngineResponse) => ctx.postMessage({ id, res }));
};
