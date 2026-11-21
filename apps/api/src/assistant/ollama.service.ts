import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class OllamaService {
  private readonly base: string;
  readonly embedModel: string;
  readonly chatModel: string;

  constructor(config: ConfigService) {
    // Accepte OLLAMA_BASE_URL ou OLLAMA_HOST (avec ou sans http://), sinon l'Ollama local
    let base = config.get<string>('OLLAMA_BASE_URL') || config.get<string>('OLLAMA_HOST') || 'http://127.0.0.1:11434';
    if (!/^https?:\/\//.test(base)) base = `http://${base}`;
    this.base = base.replace(/\/+$/, '');
    this.embedModel = config.get<string>('OLLAMA_EMBED_MODEL') || 'bge-m3';
    this.chatModel = config.get<string>('OLLAMA_MODEL') || config.get<string>('OLLAMA_CHAT_MODEL') || 'llama3.2';
  }

  get url() { return this.base; }

  private async post(path: string, body: unknown): Promise<any> {
    const res = await fetch(`${this.base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Ollama ${path} -> ${res.status}: ${await res.text()}`);
    return res.json();
  }

  async ping(): Promise<boolean> {
    try {
      return (await fetch(`${this.base}/api/tags`)).ok;
    } catch {
      return false;
    }
  }

  /** Transforme des textes en vecteurs (embeddings), par paquets de 16. */
  async embed(texts: string[]): Promise<number[][]> {
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += 16) {
      const r = await this.post('/api/embed', { model: this.embedModel, input: texts.slice(i, i + 16) });
      out.push(...r.embeddings);
    }
    return out;
  }

  async chat(messages: { role: string; content: string }[]): Promise<string> {
    const r = await this.post('/api/chat', {
      model: this.chatModel,
      messages,
      stream: false,
      options: { temperature: 0.3 },
    });
    return r.message?.content ?? '';
  }

  /** Stream chat tokens from Ollama (NDJSON). */
  async *chatStream(
    messages: { role: string; content: string }[],
  ): AsyncGenerator<string> {
    const res = await fetch(`${this.base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.chatModel,
        messages,
        stream: true,
        options: { temperature: 0.3 },
      }),
    });
    if (!res.ok) {
      throw new Error(`Ollama /api/chat -> ${res.status}: ${await res.text()}`);
    }
    if (!res.body) throw new Error('Ollama stream has no body');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const json = JSON.parse(trimmed) as {
            message?: { content?: string };
            done?: boolean;
          };
          const piece = json.message?.content;
          if (piece) yield piece;
        } catch {
          /* skip malformed chunk */
        }
      }
    }
    if (buf.trim()) {
      try {
        const json = JSON.parse(buf.trim()) as { message?: { content?: string } };
        const piece = json.message?.content;
        if (piece) yield piece;
      } catch {
        /* ignore */
      }
    }
  }
}
