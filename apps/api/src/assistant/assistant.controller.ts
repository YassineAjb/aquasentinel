import { Body, Controller, Get, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AssistantService, ChatMessage } from './assistant.service';

@Controller('assistant')
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  @Get('health')
  health() {
    return this.assistant.health();
  }

  @Get('reports')
  reports() {
    return this.assistant.listReports();
  }

  /** Non-streaming fallback. */
  @Post('ask')
  ask(
    @Body()
    body: {
      reportId?: string;
      report?: unknown;
      question?: string;
      history?: ChatMessage[];
      lang?: string;
    },
  ) {
    return this.assistant.ask(body);
  }

  /** Streaming answer (SSE). */
  @Post('ask/stream')
  async askStream(
    @Body()
    body: {
      reportId?: string;
      report?: unknown;
      question?: string;
      history?: ChatMessage[];
      lang?: string;
    },
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    try {
      for await (const event of this.assistant.askStream(body)) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
        if (event.type === 'done' || event.type === 'error') break;
      }
    } catch (e) {
      res.write(
        `data: ${JSON.stringify({
          type: 'error',
          message: e instanceof Error ? e.message : 'stream failed',
        })}\n\n`,
      );
    } finally {
      res.end();
    }
  }
}
