import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';
import { OllamaService } from './ollama.service';

type Chunk = { source: string; text: string; vec: number[] };
export type Passage = { source: string; text: string; score: number };

const cosine = (a: number[], b: number[]) => {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return d / (Math.sqrt(na) * Math.sqrt(nb) || 1);
};

@Injectable()
export class RagService implements OnModuleInit {
  private readonly log = new Logger('RAG');
  private chunks: Chunk[] = [];
  private ready: Promise<void> | null = null;
  private readonly dir: string;
  private readonly cacheFile = join(process.cwd(), '.rag-cache.json');

  constructor(config: ConfigService, private readonly ollama: OllamaService) {
    this.dir = config.get<string>('KNOWLEDGE_DIR') || join(process.cwd(), 'knowledge');
  }

  onModuleInit() {
    // ne bloque pas le démarrage du serveur si Ollama n'est pas encore lancé
    this.ensureIndex().catch((e) => this.log.warn(`Index non construit : ${e.message}`));
  }

  count() { return this.chunks.length; }

  ensureIndex(): Promise<void> {
    if (!this.ready) this.ready = this.build().catch((e) => { this.ready = null; throw e; });
    return this.ready;
  }

  private async build() {
    if (!existsSync(this.dir)) throw new Error(`dossier introuvable : ${this.dir}`);
    const files = readdirSync(this.dir).filter((f) => /\.(md|txt)$/i.test(f)).sort();
    const signature = files
      .map((f) => { const s = statSync(join(this.dir, f)); return `${f}:${s.size}:${s.mtimeMs}`; })
      .join('|') + '|' + this.ollama.embedModel;

    if (existsSync(this.cacheFile)) {
      try {
        const c = JSON.parse(readFileSync(this.cacheFile, 'utf8'));
        if (c.signature === signature) {
          this.chunks = c.chunks;
          this.log.log(`${this.chunks.length} passages chargés depuis le cache`);
          return;
        }
      } catch { /* cache illisible : on reconstruit */ }
    }

    const raw: { source: string; text: string }[] = [];
    for (const f of files) raw.push(...this.split(f, readFileSync(join(this.dir, f), 'utf8')));
    if (!raw.length) throw new Error('aucun fichier .md ou .txt dans le dossier knowledge');

    const vecs = await this.ollama.embed(raw.map((r) => r.text));
    this.chunks = raw.map((r, i) => ({ ...r, vec: vecs[i] }));
    writeFileSync(this.cacheFile, JSON.stringify({ signature, chunks: this.chunks }));
    this.log.log(`${this.chunks.length} passages indexés (${files.length} fichiers)`);
  }

  /** Découpe un fichier en passages de ~500-700 caractères, en gardant le titre. */
  private split(source: string, text: string) {
    const out: { source: string; text: string }[] = [];
    let heading = '', buf = '';
    const flush = () => {
      if (buf.trim()) out.push({ source, text: (heading ? heading + '\n' : '') + buf.trim() });
      buf = '';
    };
    for (const line of text.split(/\r?\n/)) {
      if (/^#{1,3}\s/.test(line)) { flush(); heading = line.replace(/^#+\s*/, ''); continue; }
      if (line.trim() === '' && buf.length > 500) flush();
      else buf += line + '\n';
    }
    flush();
    return out;
  }

  async search(query: string, k = 4): Promise<Passage[]> {
    await this.ensureIndex();
    const [q] = await this.ollama.embed([query]);
    return this.chunks
      .map((c) => ({ source: c.source, text: c.text, score: cosine(q, c.vec) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }
}
