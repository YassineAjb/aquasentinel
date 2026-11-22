import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ChartSpline,
  Droplets,
  Moon,
  Satellite,
  ShieldAlert,
  Sun,
  Zap,
} from 'lucide-react';
import LanguageSelect from '../components/LanguageSelect';
import { useLanguage } from '../i18n';
import { useTheme } from '../theme';

const FEATURES = [
  { key: 'monitor', Icon: Satellite },
  { key: 'compare', Icon: ChartSpline },
  { key: 'irrigate', Icon: Droplets },
  { key: 'energy', Icon: Zap },
  { key: 'guard', Icon: ShieldAlert },
] as const;

const STEPS = ['map', 'scan', 'decide'] as const;

export default function Landing() {
  const { t } = useLanguage();
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="landing-page">
      <header className="landing-topbar">
        <Link className="landing-topbar-brand" to="/">
          <img
            className="landing-topbar-logo"
            src="/logo/logo.png"
            alt=""
            width={36}
            height={36}
          />
          <span className="landing-topbar-name">SAKIYA</span>
        </Link>

        <div className="landing-topbar-actions">
          <LanguageSelect className="landing-lang" />

          <button
            type="button"
            className="landing-theme-btn"
            onClick={toggleTheme}
            aria-label={
              theme === 'dark' ? t('nav.themeLight') : t('nav.themeDark')
            }
            title={theme === 'dark' ? t('nav.themeLight') : t('nav.themeDark')}
          >
            {theme === 'dark' ? (
              <Sun size={18} strokeWidth={2} aria-hidden />
            ) : (
              <Moon size={18} strokeWidth={2} aria-hidden />
            )}
          </button>

          <Link className="primary inline landing-start" to="/dashboard">
            <span>{t('landing.start')}</span>
            <ArrowRight size={15} strokeWidth={2.4} aria-hidden />
          </Link>
        </div>
      </header>

      <section className="landing-hero has-art-brand">
        <img
          className="landing-hero-media"
          src="/hero.jpeg"
          alt="SAKIYA — intelligent agriculture for a sustainable future"
          width={1600}
          height={900}
          decoding="async"
          fetchPriority="high"
        />
        <div className="landing-hero-veil" aria-hidden />
        <div className="landing-stage">
          <p className="landing-brand">SAKIYA</p>
          <h1>{t('landing.headline')}</h1>
          <p className="landing-lead">{t('landing.lead')}</p>
        </div>
      </section>

      <section className="landing-section">
        <header className="landing-section-head">
          <p className="eyebrow">{t('landing.aboutEyebrow')}</p>
          <h2>{t('landing.aboutTitle')}</h2>
          <p className="sub">{t('landing.aboutSub')}</p>
        </header>
        <div className="landing-pillars">
          <div>
            <strong>{t('landing.pillarWater')}</strong>
            <span>{t('landing.pillarWaterText')}</span>
          </div>
          <div>
            <strong>{t('landing.pillarEnergy')}</strong>
            <span>{t('landing.pillarEnergyText')}</span>
          </div>
          <div>
            <strong>{t('landing.pillarFood')}</strong>
            <span>{t('landing.pillarFoodText')}</span>
          </div>
        </div>
      </section>

      <section className="landing-section">
        <header className="landing-section-head">
          <p className="eyebrow">{t('landing.featuresEyebrow')}</p>
          <h2>{t('landing.featuresTitle')}</h2>
          <p className="sub">{t('landing.featuresSub')}</p>
        </header>
        <ul className="landing-features">
          {FEATURES.map(({ key, Icon }) => (
            <li key={key}>
              <Icon size={20} strokeWidth={2} aria-hidden />
              <div>
                <strong>{t(`landing.feature.${key}.title`)}</strong>
                <span>{t(`landing.feature.${key}.text`)}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="landing-section">
        <header className="landing-section-head">
          <p className="eyebrow">{t('landing.howEyebrow')}</p>
          <h2>{t('landing.howTitle')}</h2>
          <p className="sub">{t('landing.howSub')}</p>
        </header>
        <ol className="landing-steps">
          {STEPS.map((key, i) => (
            <li key={key}>
              <span className="landing-step-num">{i + 1}</span>
              <div>
                <strong>{t(`landing.step.${key}.title`)}</strong>
                <span>{t(`landing.step.${key}.text`)}</span>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
