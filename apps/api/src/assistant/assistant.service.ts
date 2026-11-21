import { Injectable, Logger } from '@nestjs/common';
import { OllamaService } from './ollama.service';
import { Passage, RagService } from './rag.service';
import { ReportService } from './report.service';

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

const LANGS: Record<string, string> = {
  fr: 'français simple',
  'ar-tn': 'arabe, en lettres arabes, dans un style simple et proche du parler tunisien',
  en: 'English, simple words',
};
const DEFAULT_Q = 'Explique-moi ce rapport simplement et dis-moi quoi faire.';
const MAX_REPORT_CHARS = 6000;

const buildSystem = (langue: string, report: unknown, passages: Passage[]) => {
  let rapport = JSON.stringify(report ?? {}, null, 1);
  if (rapport.length > MAX_REPORT_CHARS) rapport = rapport.slice(0, MAX_REPORT_CHARS) + '\n... (tronqué)';
  const contexte = passages.map((p, i) => `[${i + 1}] (${p.source})\n${p.text}`).join('\n\n') || '(aucun)';
  return `Tu es l'assistant de la plateforme Mizara. Tu aides un agriculteur à comprendre le rapport de sa parcelle (images satellite Sentinel-2, indice NDVI, humidité, météo).

Règles :
- Réponds en ${langue}. Phrases courtes, sans jargon.
- Le RAPPORT compare l'indice NDVI d'une parcelle entre deux dates (A puis B). Pour les faits sur LA PARCELLE (valeurs, dates, variation), utilise uniquement le RAPPORT.
- Si la date A et la date B sont identiques, dis qu'il n'y a aucune évolution à comparer et qu'il faut choisir deux dates différentes.
- Pour les explications et conseils généraux, utilise uniquement les CONNAISSANCES ci-dessous.
- Si la réponse n'est ni dans le rapport ni dans les connaissances, dis-le clairement. N'invente aucun chiffre.
- Commence par ce qu'il faut faire, puis explique pourquoi. Pas de promesse de rendement.
- Pour les produits (engrais, pesticides) ou un doute sérieux : conseille un technicien agricole.
- 150 mots maximum.

<rapport>
${rapport}
</rapport>

<connaissances>
${contexte}
</connaissances>`;
};

@Injectable()
export class AssistantService {
  private readonly log = new Logger('Assistant');
  constructor(
    private readonly ollama: OllamaService,
    private readonly rag: RagService,
    private readonly reports: ReportService,
  ) {}

  listReports() {
    return this.reports.list();
  }

  async health() {
    return { ollama: await this.ollama.ping(), passages: this.rag.count(), chatModel: this.ollama.chatModel };
  }

  async ask(input: { reportId?: string; report?: unknown; question?: string; history?: ChatMessage[]; lang?: string }) {
    const { reportId, question, lang = 'fr' } = input;
    const history = input.history ?? [];
    const q = question?.trim() || DEFAULT_Q;
    try {
      const report = reportId ? await this.reports.get(reportId) : input.report;
      const interp = String((report as any)?.interpretation ?? '').slice(0, 150);
      const searchQuery = question?.trim() || `Interprétation de l'indice NDVI et conseils d'irrigation. ${interp}`;
      const passages = await this.rag.search(searchQuery, 4);
      const answer = await this.ollama.chat([
        { role: 'system', content: buildSystem(LANGS[lang] ?? LANGS['fr'], report, passages) },
        ...history.slice(-6),
        { role: 'user', content: q },
      ]);
      return {
        answer,
        sources: passages.map((p) => ({ file: p.source, score: Number(p.score.toFixed(2)), excerpt: p.text.slice(0, 160) })),
      };
    } catch (e) {
      this.log.error(`assistant error: ${(e as Error).message}`);
      return {
        answer: "L'assistant est indisponible pour le moment (modèle local ou rapport introuvable). Le rapport reste valable.",
        sources: [],
      };
    }
  }
}
