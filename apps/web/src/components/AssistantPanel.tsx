import { useEffect, useRef, useState } from 'react';
import { ArrowUp, AudioLines, Square } from 'lucide-react';

type SpeechRec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
};

function getSpeechRecognition(): (new () => SpeechRec) | null {
  const w = window as Window & {
    SpeechRecognition?: new () => SpeechRec;
    webkitSpeechRecognition?: new () => SpeechRec;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

const SPEECH_LANG: Record<string, string> = {
  fr: 'fr-FR',
  en: 'en-US',
  'ar-tn': 'ar-TN',
  ja: 'ja-JP',
};

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
  const [listening, setListening] = useState(false);
  const [voiceHint, setVoiceHint] = useState('');
  const bottom = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const recognitionRef = useRef<SpeechRec | null>(null);
  const askRef = useRef<(q: string) => void>(() => {});

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

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, []);

  function stopListening() {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
  }

  function startListening() {
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      setVoiceHint('Voice input needs Chrome or Edge.');
      return;
    }
    if (!reportId || busy) return;

    setVoiceHint('');
    recognitionRef.current?.abort();

    const rec = new Ctor();
    rec.lang = SPEECH_LANG[lang] || 'en-US';
    rec.continuous = false;
    rec.interimResults = true;
    recognitionRef.current = rec;

    rec.onresult = (ev) => {
      let finalText = '';
      let interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const chunk = ev.results[i][0].transcript;
        if (ev.results[i].isFinal) finalText += chunk;
        else interim += chunk;
      }
      const spoken = (finalText || interim).trim();
      if (spoken) setInput(spoken);
      if (finalText.trim()) {
        setListening(false);
        recognitionRef.current = null;
        askRef.current(finalText.trim());
      }
    };

    rec.onerror = (ev) => {
      setListening(false);
      recognitionRef.current = null;
      if (ev.error === 'not-allowed') {
        setVoiceHint('Microphone permission denied.');
      } else if (ev.error !== 'aborted' && ev.error !== 'no-speech') {
        setVoiceHint('Couldn’t hear that — try again.');
      }
    };

    rec.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };

    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
      setVoiceHint('Couldn’t start the microphone.');
    }
  }

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

  askRef.current = ask;

  const hasText = input.trim().length > 0;

  const bubble = (role: Msg['role']): React.CSSProperties => ({
    alignSelf: role === 'user' ? 'flex-end' : 'flex-start',
    maxWidth: '88%',
    padding: '10px 13px',
    borderRadius: role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
    whiteSpace: 'pre-wrap',
    border:
      role === 'user'
        ? '1px solid rgba(120, 210, 150, 0.35)'
        : '1px solid rgba(255, 255, 255, 0.14)',
    background:
      role === 'user'
        ? 'linear-gradient(145deg, rgba(47, 158, 68, 0.55), rgba(20, 90, 50, 0.45))'
        : 'rgba(255, 255, 255, 0.08)',
    boxShadow:
      role === 'user'
        ? 'inset 0 1px 0 rgba(255,255,255,0.22)'
        : 'inset 0 1px 0 rgba(255,255,255,0.12)',
    color: role === 'user' ? '#f4fff6' : 'rgba(240, 248, 242, 0.95)',
    backdropFilter: 'blur(10px)',
  });

  const last = messages[messages.length - 1];
  const streamingEmpty =
    busy && last?.role === 'assistant' && last.content.length === 0;

  return (
    <section className="panel assistant-chat">
      <div className="assistant-controls">
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
      </div>

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

      <div className="assistant-thread" aria-live="polite">
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

      <div className={`assistant-composer${listening ? ' is-listening' : ''}`}>
        <input
          value={input}
          placeholder={listening ? 'Listening…' : 'Ask about your field…'}
          disabled={!reportId || busy}
          onChange={(e) => {
            setInput(e.target.value);
            if (listening) stopListening();
          }}
          onKeyDown={(e) => e.key === 'Enter' && hasText && ask(input)}
        />
        {busy ? (
          <button
            type="button"
            className="assistant-voice-btn is-stop"
            aria-label="Stop"
            title="Stop"
            onClick={() => abortRef.current?.abort()}
          >
            <Square size={14} strokeWidth={2.5} fill="currentColor" aria-hidden />
          </button>
        ) : hasText ? (
          <button
            type="button"
            className="assistant-voice-btn is-send"
            aria-label="Send"
            title="Send"
            disabled={!reportId}
            onClick={() => ask(input)}
          >
            <ArrowUp size={18} strokeWidth={2.5} aria-hidden />
          </button>
        ) : listening ? (
          <button
            type="button"
            className="assistant-voice-btn is-listening"
            aria-label="Stop listening"
            title="Stop listening"
            onClick={stopListening}
          >
            <Square size={14} strokeWidth={2.5} fill="currentColor" aria-hidden />
          </button>
        ) : (
          <button
            type="button"
            className="assistant-voice-btn"
            aria-label="Voice input"
            title="Talk"
            disabled={!reportId}
            onClick={startListening}
          >
            <AudioLines size={18} strokeWidth={2.25} aria-hidden />
          </button>
        )}
      </div>
      {voiceHint ? (
        <p className="hint">{voiceHint}</p>
      ) : (
        <p className="hint">
          {listening
            ? 'Speak now — your question will send when you pause.'
            : 'Type to send, or tap the waveform to talk.'}
        </p>
      )}
    </section>
  );
}
