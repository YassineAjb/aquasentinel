import { useEffect, useRef, useState } from 'react';

const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined) || 'http://127.0.0.1:3000';

type Msg = { role: 'user' | 'assistant'; content: string; sources?: string[] };
type ReportItem = { _id: string; title: string; dateA?: string; dateB?: string };

const QUICK: Record<string, string[]> = {
  fr: [
    'Explique ce rapport simplement.',
    'Que dois-je faire cette semaine ?',
    'Mon NDVI est-il bon ?',
    'Pourquoi inspecter mon champ ?',
  ],
  en: [
    'Explain this report simply.',
    'What should I do this week?',
    'Is my NDVI good?',
    'Why should I inspect my field?',
  ],
  'ar-tn': [
    'اشرح لي هذا التقرير ببساطة.',
    'ماذا أفعل هذا الأسبوع؟',
    'هل مؤشر NDVI جيد؟',
    'لماذا يجب أن أفحص حقلي؟',
  ],
  ja: [
    'このレポートを簡単に説明して。',
    '今週は何をすべき？',
    'NDVIは良好？',
    'なぜ畑を点検すべき？',
  ],
};

type StreamEvent =
  | { type: 'meta'; sources?: { file: string }[] }
  | { type: 'token'; text: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

export default function AssistantPanel({
  reports,
  activeReportId,
}: {
  reports: ReportItem[];
  activeReportId?: string | null;
}) {
  const [reportId, setReportId] = useState('');
  const [lang, setLang] = useState('fr');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (activeReportId) setReportId(activeReportId);
    else if (!reportId && reports[0]) setReportId(reports[0]._id);
  }, [activeReportId, reports]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    abortRef.current?.abort();
    setMessages([]);
  }, [reportId, lang]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || !reportId || busy) return;
    const history = messages.map(({ role, content }) => ({ role, content }));
    setMessages((m) => [
      ...m,
      { role: 'user', content: q },
      { role: 'assistant', content: '' },
    ]);
    setInput('');
    setBusy(true);

    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const res = await fetch(`${API_URL}/assistant/ask/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ reportId, question: q, history, lang }),
        signal: ac.signal,
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(
          (errBody as { message?: string }).message || `HTTP ${res.status}`,
        );
      }
      if (!res.body) throw new Error('No stream body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let gotToken = false;

      const appendToken = (text: string) => {
        gotToken = true;
        setMessages((m) => {
          const copy = [...m];
          const last = copy[copy.length - 1];
          if (!last || last.role !== 'assistant') return m;
          copy[copy.length - 1] = { ...last, content: last.content + text };
          return copy;
        });
      };

      const setSources = (files: string[]) => {
        setMessages((m) => {
          const copy = [...m];
          const last = copy[copy.length - 1];
          if (!last || last.role !== 'assistant') return m;
          copy[copy.length - 1] = { ...last, sources: files };
          return copy;
        });
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop() ?? '';
        for (const part of parts) {
          const line = part
            .split('\n')
            .map((l) => l.trim())
            .find((l) => l.startsWith('data:'));
          if (!line) continue;
          const raw = line.slice(5).trim();
          if (!raw || raw === '[DONE]') continue;
          let ev: StreamEvent;
          try {
            ev = JSON.parse(raw) as StreamEvent;
          } catch {
            continue;
          }
          if (ev.type === 'meta' && ev.sources?.length) {
            setSources([...new Set(ev.sources.map((s) => s.file))]);
          } else if (ev.type === 'token' && ev.text) {
            appendToken(ev.text);
          } else if (ev.type === 'error') {
            throw new Error(ev.message || 'stream error');
          }
        }
      }

      if (!gotToken) {
        setMessages((m) => {
          const copy = [...m];
          const last = copy[copy.length - 1];
          if (last?.role === 'assistant' && !last.content) {
            copy[copy.length - 1] = {
              ...last,
              content: 'No answer received. Check that Ollama is running.',
            };
          }
          return copy;
        });
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setMessages((m) => {
        const copy = [...m];
        const last = copy[copy.length - 1];
        const msg = `Error: ${err instanceof Error ? err.message : 'request failed'}`;
        if (last?.role === 'assistant') {
          copy[copy.length - 1] = {
            ...last,
            content: last.content ? `${last.content}\n\n${msg}` : msg,
          };
          return copy;
        }
        return [...copy, { role: 'assistant', content: msg }];
      });
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  const bubble = (role: Msg['role']): React.CSSProperties => ({
    alignSelf: role === 'user' ? 'flex-end' : 'flex-start',
    maxWidth: '92%',
    padding: '8px 11px',
    borderRadius: 12,
    whiteSpace: 'pre-wrap',
    background: role === 'user' ? 'rgba(11,93,90,.88)' : 'rgba(127,127,127,.16)',
    color: role === 'user' ? '#fff' : 'inherit',
  });

  const last = messages[messages.length - 1];
  const streamingEmpty =
    busy && last?.role === 'assistant' && last.content.length === 0;

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Assistant</h2>
      </div>

      <label className="field">
        <span>Report</span>
        <select value={reportId} onChange={(e) => setReportId(e.target.value)}>
          {reports.map((r) => (
            <option key={r._id} value={r._id}>
              {r.dateA || '?'} → {r.dateB || '?'}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Answer language</span>
        <select value={lang} onChange={(e) => setLang(e.target.value)}>
          <option value="fr">Français</option>
          <option value="ar-tn">العربية (تونسي)</option>
          <option value="en">English</option>
          <option value="ja">日本語</option>
        </select>
      </label>

      <div className="layer-toggle" style={{ flexWrap: 'wrap' }}>
        {(QUICK[lang] || QUICK.en).map((q) => (
          <button
            key={q}
            type="button"
            className="chip"
            disabled={busy || !reportId}
            onClick={() => ask(q)}
          >
            {q}
          </button>
        ))}
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          maxHeight: 340,
          overflowY: 'auto',
          margin: '10px 0',
        }}
        aria-live="polite"
      >
        {messages.length === 0 && (
          <p className="hint">Pick a question above or type your own.</p>
        )}
        {messages.map((m, i) => {
          const isStreamingTail =
            busy && i === messages.length - 1 && m.role === 'assistant';
          if (isStreamingTail && !m.content) return null;
          return (
            <div key={i} dir="auto" style={bubble(m.role)}>
              {m.content}
              {isStreamingTail && <span className="assistant-cursor">▍</span>}
              {m.sources && m.sources.length > 0 && (
                <div className="hint tight" dir="ltr" style={{ marginTop: 4 }}>
                  Sources: {m.sources.join(', ')}
                </div>
              )}
            </div>
          );
        })}
        {streamingEmpty && (
          <div style={bubble('assistant')}>
            Thinking…
            <span className="assistant-cursor">▍</span>
          </div>
        )}
        <div ref={bottom} />
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <input
          style={{ flex: 1 }}
          value={input}
          placeholder="Ask about your field…"
          disabled={!reportId || busy}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && ask(input)}
        />
        {busy ? (
          <button
            className="ghost"
            type="button"
            onClick={() => abortRef.current?.abort()}
          >
            Stop
          </button>
        ) : (
          <button
            className="primary"
            type="button"
            disabled={!reportId || !input.trim()}
            onClick={() => ask(input)}
          >
            Send
          </button>
        )}
      </div>
      <p className="hint">Answers stream live from the report + knowledge base (local model).</p>
    </section>
  );
}
