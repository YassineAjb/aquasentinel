import { useEffect, useRef, useState } from 'react';

// Adresse de l'API NestJS. Si votre ../api utilise déjà une autre adresse (ou un proxy),
// recopiez la même ici, ou définissez VITE_API_URL dans apps/web/.env
const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:3000';

type Msg = { role: 'user' | 'assistant'; content: string; sources?: string[] };
type ReportItem = { _id: string; title: string; dateA?: string; dateB?: string };

const QUICK = [
  'Explain this report simply.',
  'What should I do this week?',
  'Is my NDVI good?',
  'Why should I inspect my field?',
];

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

  // Sélectionne le rapport qui vient d'être enregistré, sinon le plus récent
  useEffect(() => {
    if (activeReportId) setReportId(activeReportId);
    else if (!reportId && reports[0]) setReportId(reports[0]._id);
  }, [activeReportId, reports]); // eslint-disable-line react-hooks/exhaustive-deps

  // Nouvelle conversation quand on change de rapport
  useEffect(() => setMessages([]), [reportId]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || !reportId || busy) return;
    const history = messages.map(({ role, content }) => ({ role, content }));
    setMessages((m) => [...m, { role: 'user', content: q }]);
    setInput('');
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/assistant/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId, question: q, history, lang }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
      const sources = [
        ...new Set<string>((data.sources || []).map((s: { file: string }) => s.file)),
      ];
      setMessages((m) => [...m, { role: 'assistant', content: data.answer, sources }]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          content: `Error: ${err instanceof Error ? err.message : 'request failed'}`,
        },
      ]);
    } finally {
      setBusy(false);
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
        </select>
      </label>

      <div className="layer-toggle" style={{ flexWrap: 'wrap' }}>
        {QUICK.map((q) => (
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
        {messages.map((m, i) => (
          <div key={i} dir="auto" style={bubble(m.role)}>
            {m.content}
            {m.sources && m.sources.length > 0 && (
              <div className="hint tight" dir="ltr" style={{ marginTop: 4 }}>
                Sources: {m.sources.join(', ')}
              </div>
            )}
          </div>
        ))}
        {busy && (
          <div style={bubble('assistant')}>Thinking… this can take up to a minute.</div>
        )}
        <div ref={bottom} />
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <input
          style={{ flex: 1 }}
          value={input}
          placeholder="Ask about your field…"
          disabled={!reportId}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && ask(input)}
        />
        <button
          className="primary"
          type="button"
          disabled={busy || !reportId || !input.trim()}
          onClick={() => ask(input)}
        >
          Send
        </button>
      </div>
      <p className="hint">Answers come from the saved report and the knowledge base (local model).</p>
    </section>
  );
}
