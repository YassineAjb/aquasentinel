import { useEffect, useState } from 'react';
import { MessageCircle, X } from 'lucide-react';
import AssistantPanel from './AssistantPanel';

const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined) || 'http://127.0.0.1:3000';

type ReportItem = {
  _id: string;
  title: string;
  dateA?: string;
  dateB?: string;
};

export default function AssistantFloat() {
  const [open, setOpen] = useState(false);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`${API_URL}/assistant/reports`);
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(
            (data as { message?: string })?.message || `HTTP ${res.status}`,
          );
        }
        const list = Array.isArray(data) ? data : [];
        const normalized: ReportItem[] = list
          .map((r: { _id?: string; id?: string; title?: string; dateA?: string; dateB?: string }) => ({
            _id: String(r._id || r.id || ''),
            title: r.title || 'Report',
            dateA: r.dateA,
            dateB: r.dateB,
          }))
          .filter((r) => r._id);
        if (!cancelled) setReports(normalized);
      } catch (e) {
        if (!cancelled) {
          setReports([]);
          setError(e instanceof Error ? e.message : 'Failed to load reports');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      {!open && (
        <button
          type="button"
          className="assistant-fab"
          onClick={() => setOpen(true)}
          aria-label="Open field assistant"
          title="Field assistant"
        >
          <MessageCircle size={22} strokeWidth={2} aria-hidden />
        </button>
      )}

      {open && (
        <div className="assistant-layer">
          <button
            type="button"
            className="assistant-backdrop"
            aria-label="Close assistant"
            onClick={() => setOpen(false)}
          />
          <aside className="assistant-sheet" aria-label="Field assistant">
            <header className="assistant-sheet-head">
              <div>
                <p className="eyebrow">AquaSentinel</p>
                <h2>Field assistant</h2>
              </div>
              <button
                type="button"
                className="assistant-close"
                aria-label="Close"
                onClick={() => setOpen(false)}
              >
                <X size={18} strokeWidth={2} aria-hidden />
              </button>
            </header>
            <div className="assistant-sheet-body">
              {loading ? (
                <p className="hint">Loading saved reports…</p>
              ) : error ? (
                <p className="hint">Couldn’t load reports: {error}</p>
              ) : reports.length === 0 ? (
                <p className="hint">
                  No saved reports yet. On Analysis, compare two dates and use{' '}
                  <strong>Open HTML report</strong> / save so a report is stored,
                  then reopen the assistant.
                </p>
              ) : (
                <AssistantPanel reports={reports} />
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
