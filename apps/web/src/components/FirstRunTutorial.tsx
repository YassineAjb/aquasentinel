import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { CircleHelp, X } from 'lucide-react';
import { useAuth } from '../auth';
import { useLanguage } from '../i18n';

const STORAGE_PREFIX = 'sakiya-tutorial-done';

type Step = {
  id: string;
  target: string | null;
  titleKey: string;
  bodyKey: string;
};

const STEPS: Step[] = [
  {
    id: 'welcome',
    target: null,
    titleKey: 'tutorial.welcome.title',
    bodyKey: 'tutorial.welcome.body',
  },
  {
    id: 'sites',
    target: 'nav-sites',
    titleKey: 'tutorial.sites.title',
    bodyKey: 'tutorial.sites.body',
  },
  {
    id: 'analysis',
    target: 'nav-analysis',
    titleKey: 'tutorial.analysis.title',
    bodyKey: 'tutorial.analysis.body',
  },
  {
    id: 'water',
    target: 'nav-waterguard',
    titleKey: 'tutorial.water.title',
    bodyKey: 'tutorial.water.body',
  },
  {
    id: 'cutsheet',
    target: 'nav-cutsheetrx',
    titleKey: 'tutorial.cutsheet.title',
    bodyKey: 'tutorial.cutsheet.body',
  },
  {
    id: 'assistant',
    target: 'assistant-fab',
    titleKey: 'tutorial.assistant.title',
    bodyKey: 'tutorial.assistant.body',
  },
  {
    id: 'done',
    target: null,
    titleKey: 'tutorial.done.title',
    bodyKey: 'tutorial.done.body',
  },
];

type Spot = { top: number; left: number; width: number; height: number };

function storageKey(userId?: string | null) {
  return userId ? `${STORAGE_PREFIX}:${userId}` : STORAGE_PREFIX;
}

function readDone(userId?: string | null) {
  try {
    return localStorage.getItem(storageKey(userId)) === '1';
  } catch {
    return false;
  }
}

function writeDone(userId?: string | null) {
  try {
    localStorage.setItem(storageKey(userId), '1');
  } catch {
    /* ignore */
  }
}

function measureTarget(selector: string): Spot | null {
  const el = document.querySelector(
    `[data-tour="${selector}"]`,
  ) as HTMLElement | null;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return null;
  const pad = 8;
  return {
    top: Math.max(0, r.top - pad),
    left: Math.max(0, r.left - pad),
    width: r.width + pad * 2,
    height: r.height + pad * 2,
  };
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExpandNav?: () => void;
};

export function useTutorialGate() {
  const { user, ready } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!ready || !user) return;
    if (!readDone(user.id)) setOpen(true);
  }, [ready, user]);

  const start = useCallback(() => setOpen(true), []);
  const stop = useCallback(() => setOpen(false), []);

  return { open, setOpen, start, stop, userId: user?.id };
}

export default function FirstRunTutorial({
  open,
  onOpenChange,
  onExpandNav,
}: Props) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [spot, setSpot] = useState<Spot | null>(null);

  const current = STEPS[step] ?? STEPS[0];
  const isLast = step === STEPS.length - 1;
  const isFirst = step === 0;

  const finish = useCallback(() => {
    writeDone(user?.id);
    onOpenChange(false);
    setStep(0);
  }, [onOpenChange, user?.id]);

  const goNext = useCallback(() => {
    if (isLast) {
      finish();
      navigate('/sites');
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }, [finish, isLast, navigate]);

  const goBack = useCallback(() => {
    setStep((s) => Math.max(0, s - 1));
  }, []);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    onExpandNav?.();
  }, [open, onExpandNav]);

  const refreshSpot = useCallback(() => {
    if (!open) {
      setSpot(null);
      return;
    }
    if (!current.target) {
      setSpot(null);
      return;
    }
    setSpot(measureTarget(current.target));
  }, [current.target, open]);

  useLayoutEffect(() => {
    refreshSpot();
  }, [refreshSpot, step]);

  /* Lift the real UI target above the overlay so the spotlight never hides it */
  useEffect(() => {
    if (!open || !current.target) return;
    const el = document.querySelector(
      `[data-tour="${current.target}"]`,
    ) as HTMLElement | null;
    if (!el) return;
    el.classList.add('tour-target-live');
    return () => {
      el.classList.remove('tour-target-live');
    };
  }, [open, current.target, step]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => refreshSpot();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    const id = window.setInterval(refreshSpot, 400);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
      window.clearInterval(id);
    };
  }, [open, refreshSpot]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
      if (e.key === 'ArrowRight' || e.key === 'Enter') goNext();
      if (e.key === 'ArrowLeft') goBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, finish, goNext, goBack]);

  const cardStyle = useMemo(() => {
    if (!spot) return undefined;
    const gap = 16;
    const cardW = Math.min(420, window.innerWidth - 24);
    const cardH = 260;
    const nearBottom = spot.top + spot.height > window.innerHeight - 140;
    const nearRight = spot.left + spot.width > window.innerWidth - 160;

    /* Keep tip clear of the floating assistant (bottom-right) */
    if (current.target === 'assistant-fab' || (nearBottom && nearRight)) {
      return {
        top: Math.max(16, Math.min(spot.top - cardH - gap, window.innerHeight / 2 - cardH / 2)),
        left: Math.max(12, Math.min(spot.left - cardW - gap, window.innerWidth - cardW - 12)),
        width: cardW,
      };
    }

    const preferBelow = spot.top + spot.height + gap + cardH < window.innerHeight;
    const top = preferBelow
      ? spot.top + spot.height + gap
      : Math.max(12, spot.top - gap - cardH);
    let left = spot.left;
    if (left + cardW > window.innerWidth - 12) {
      left = Math.max(12, window.innerWidth - cardW - 12);
    }
    return { top, left, width: cardW };
  }, [spot, current.target]);

  if (!open) return null;

  return (
    <div className="tour-root" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      <div
        className={`tour-catcher${spot ? ' has-spot' : ''}`}
        aria-hidden
      />
      {spot ? (
        <div
          className="tour-spot"
          style={{
            top: spot.top,
            left: spot.left,
            width: spot.width,
            height: spot.height,
          }}
          aria-hidden
        />
      ) : (
        <div className="tour-dim" aria-hidden />
      )}

      <div
        className={`tour-card${spot ? ' tour-card-anchored' : ' tour-card-center'}${
          current.target === 'assistant-fab' ? ' tour-card-above-fab' : ''
        }`}
        style={spot ? cardStyle : undefined}
      >
        <div className="tour-card-top">
          <p className="tour-eyebrow">
            {t('tutorial.eyebrow', { step: step + 1, total: STEPS.length })}
          </p>
          <button
            type="button"
            className="tour-close"
            aria-label={t('tutorial.skip')}
            onClick={finish}
          >
            <X size={18} strokeWidth={2.25} aria-hidden />
          </button>
        </div>

        <h2 id="tour-title">{t(current.titleKey)}</h2>
        <p className="tour-body">{t(current.bodyKey)}</p>

        <div className="tour-dots" aria-hidden>
          {STEPS.map((s, i) => (
            <span
              key={s.id}
              className={`tour-dot${i === step ? ' is-active' : ''}${i < step ? ' is-done' : ''}`}
            />
          ))}
        </div>

        <div className="tour-actions">
          {!isFirst && (
            <button type="button" className="tour-btn tour-btn-ghost" onClick={goBack}>
              {t('tutorial.back')}
            </button>
          )}
          <button type="button" className="tour-btn tour-btn-ghost" onClick={finish}>
            {t('tutorial.skip')}
          </button>
          <button type="button" className="tour-btn tour-btn-primary" onClick={goNext}>
            {isLast ? t('tutorial.start') : t('tutorial.next')}
          </button>
        </div>
      </div>
    </div>
  );
}

export function TutorialHelpButton({ onClick }: { onClick: () => void }) {
  const { t } = useLanguage();
  return (
    <button
      type="button"
      className="app-lang-btn app-help-btn"
      title={t('tutorial.help')}
      aria-label={t('tutorial.help')}
      onClick={onClick}
    >
      <CircleHelp size={15} strokeWidth={2} aria-hidden />
      <span className="app-help-label">{t('tutorial.help')}</span>
    </button>
  );
}
