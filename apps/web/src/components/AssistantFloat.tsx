import { useEffect, useState } from 'react';
import { MessageCircle, Sparkles, X } from 'lucide-react';
import { useLanguage } from '../i18n';
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
  const { t } = useLanguage();
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
            title: r.title || t('assistant.report'),
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
  }, [open, t]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <>
      {!open && (
        <button
          type="button"
          className="assistant-fab"
          onClick={() => setOpen(true)}
          aria-label={t('assistant.open')}
          title={t('assistant.title')}
        >
          <MessageCircle size={22} strokeWidth={2} aria-hidden />
        </button>
      )}

      {open && (
        <div className="assistant-layer" role="presentation">
          <button
            type="button"
            className="assistant-backdrop"
            aria-label={t('assistant.close')}
            onClick={() => setOpen(false)}
          />
          <div
            className="assistant-modal"
            role="dialog"
            aria-modal="true"
            aria-label={t('assistant.title')}
          >
            <div className="assistant-modal-glow" aria-hidden />
            <header className="assistant-modal-head">
              <div className="assistant-modal-brand">
                <span className="assistant-modal-icon" aria-hidden>
                  <Sparkles size={18} strokeWidth={2} />
                </span>
                <div>
                  <p className="eyebrow">SAKIYA</p>
                  <h2>{t('assistant.title')}</h2>
                </div>
              </div>
              <button
                type="button"
                className="assistant-close"
                aria-label={t('assistant.close')}
                onClick={() => setOpen(false)}
              >
                <X size={18} strokeWidth={2} aria-hidden />
              </button>
            </header>
            <div className="assistant-modal-body">
              {loading ? (
                <p className="hint">{t('assistant.loading')}</p>
              ) : error ? (
                <p className="hint">{t('assistant.loadError', { error })}</p>
              ) : reports.length === 0 ? (
                <p className="hint">{t('assistant.empty')}</p>
              ) : (
                <AssistantPanel reports={reports} />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
