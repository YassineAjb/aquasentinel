import { Injectable, Logger } from '@nestjs/common';
import { OllamaService } from './ollama.service';
import { Passage, RagService } from './rag.service';
import { ReportService } from './report.service';

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

type LangCode = 'fr' | 'ar-tn' | 'en' | 'ja';

const LANG_RULE: Record<LangCode, string> = {
  fr: `OUTPUT LANGUAGE (mandatory): French only.
Write every sentence in French. Do not switch to English, Arabic, or Japanese.`,
  'ar-tn': `OUTPUT LANGUAGE (mandatory): Arabic only — Arabic script (حروف عربية).
Write EVERY word of the answer in Arabic (simple Tunisian-friendly style is OK).
Do NOT write French. Do NOT write English. Do NOT write Japanese. Do NOT transliterate into Latin letters.
If the user question is in English/French, still answer fully in Arabic.`,
  en: `OUTPUT LANGUAGE (mandatory): English only.
Write every sentence in English. Do not switch to French, Arabic, or Japanese.`,
  ja: `OUTPUT LANGUAGE (mandatory): Japanese only — use Japanese script (漢字・ひらがな・カタカナ).
Write EVERY word of the answer in Japanese.
Do NOT write French. Do NOT write English. Do NOT write Arabic.
If the user question is in English/French, still answer fully in Japanese.
Keep a clear, polite, simple tone suitable for a farmer.`,
};

const DEFAULT_Q: Record<LangCode, string> = {
  fr: 'Explique-moi ce rapport simplement et dis-moi quoi faire.',
  'ar-tn': 'اشرح لي هذا التقرير ببساطة وقل لي ماذا أفعل.',
  en: 'Explain this report simply and tell me what to do.',
  ja: 'このレポートを簡単に説明し、何をすべきか教えてください。',
};

const MAX_REPORT_CHARS = 6000;

function normalizeLang(lang?: string): LangCode {
  if (lang === 'ar-tn' || lang === 'ar' || lang === 'arabic') return 'ar-tn';
  if (lang === 'en' || lang === 'english') return 'en';
  if (lang === 'ja' || lang === 'jp' || lang === 'japanese') return 'ja';
  return 'fr';
}

const buildSystem = (lang: LangCode, report: unknown, passages: Passage[]) => {
  let rapport = JSON.stringify(report ?? {}, null, 1);
  if (rapport.length > MAX_REPORT_CHARS) rapport = rapport.slice(0, MAX_REPORT_CHARS) + '\n... (truncated)';
  const contexte =
    passages.map((p, i) => `[${i + 1}] (${p.source})\n${p.text}`).join('\n\n') || '(none)';
  return `You are AquaSentinel's field assistant. You help a farmer understand a plot report (Sentinel-2, NDVI, weather).

${LANG_RULE[lang]}

Rules:
- Short sentences, no jargon.
- The REPORT compares NDVI between date A and date B. For plot facts (values, dates, change), use ONLY the REPORT.
- If date A and date B are the same, say there is no change to compare and two different dates are needed.
- For general advice, use ONLY the KNOWLEDGE below.
- If the answer is not in the report or knowledge, say so. Never invent numbers.
- Start with what to do, then why. No yield promises.
- For fertilizers/pesticides or serious doubt: recommend an agricultural technician.
- Max 150 words.
- Keep numbers (NDVI, dates, %) as digits; explain them in the output language above.

<report>
${rapport}
</report>

<knowledge>
${contexte}
</knowledge>`;
};

function wrapUserQuestion(lang: LangCode, question: string): string {
  const lock =
    lang === 'ar-tn'
      ? 'أجب باللغة العربية فقط (حروف عربية)، بدون فرنسية وبدون إنجليزية وبدون يابانية.'
      : lang === 'en'
        ? 'Answer in English only. No French. No Arabic. No Japanese.'
        : lang === 'ja'
          ? '日本語のみで答えてください。フランス語・英語・アラビア語は使わないでください。'
          : 'Réponds uniquement en français. Pas d’anglais, ni d’arabe, ni de japonais.';
  return `${lock}\n\n${question}`;
}

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

  private async prepareAsk(input: {
    reportId?: string;
    report?: unknown;
    question?: string;
    history?: ChatMessage[];
    lang?: string;
  }) {
    const { reportId, question } = input;
    const lang = normalizeLang(input.lang);
    const history = input.history ?? [];
    const q = question?.trim() || DEFAULT_Q[lang];
    const report = reportId ? await this.reports.get(reportId) : input.report;
    const interp = String(
      (report as { interpretation?: string } | undefined)?.interpretation ?? '',
    ).slice(0, 150);
    const searchQuery =
      question?.trim() || `NDVI interpretation irrigation advice. ${interp}`;
    const passages = await this.rag.search(searchQuery, 4);
    const messages = [
      { role: 'system', content: buildSystem(lang, report, passages) },
      // Drop prior turns when switching language bias — history often locks French.
      ...history.slice(-4),
      { role: 'user', content: wrapUserQuestion(lang, q) },
    ];
    const sources = passages.map((p) => ({
      file: p.source,
      score: Number(p.score.toFixed(2)),
      excerpt: p.text.slice(0, 160),
    }));
    return { messages, sources, lang };
  }

  async ask(input: {
    reportId?: string;
    report?: unknown;
    question?: string;
    history?: ChatMessage[];
    lang?: string;
  }) {
    try {
      const { messages, sources } = await this.prepareAsk(input);
      const answer = await this.ollama.chat(messages);
      return { answer, sources };
    } catch (e) {
      this.log.error(`assistant error: ${(e as Error).message}`);
      return {
        answer:
          "L'assistant est indisponible pour le moment (modèle local ou rapport introuvable). Le rapport reste valable.",
        sources: [],
      };
    }
  }

  /**
   * SSE events:
   *  meta  → { sources }
   *  token → { text }
   *  done  → {}
   *  error → { message }
   */
  async *askStream(input: {
    reportId?: string;
    report?: unknown;
    question?: string;
    history?: ChatMessage[];
    lang?: string;
  }): AsyncGenerator<
    | { type: 'meta'; sources: { file: string; score: number; excerpt: string }[] }
    | { type: 'token'; text: string }
    | { type: 'done' }
    | { type: 'error'; message: string }
  > {
    try {
      const { messages, sources } = await this.prepareAsk(input);
      yield { type: 'meta', sources };
      for await (const text of this.ollama.chatStream(messages)) {
        if (text) yield { type: 'token', text };
      }
      yield { type: 'done' };
    } catch (e) {
      this.log.error(`assistant stream error: ${(e as Error).message}`);
      yield {
        type: 'error',
        message:
          (e as Error).message ||
          "L'assistant est indisponible pour le moment (modèle local ou rapport introuvable).",
      };
    }
  }
}
