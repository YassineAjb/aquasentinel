import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Droplets, Eye, EyeOff, Leaf, X, Zap } from 'lucide-react';
import { useAuth } from '../auth';
import { useLanguage } from '../i18n';

type Mode = 'login' | 'signup';

export default function Auth({ mode }: { mode: Mode }) {
  const { t } = useLanguage();
  const { user, ready, login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from =
    (location.state as { from?: string } | null)?.from || '/dashboard';

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (ready && user) {
    return <Navigate to={from} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'signup') {
        await register(name.trim(), email.trim(), password);
      } else {
        await login(email.trim(), password);
      }
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.failed'));
    } finally {
      setBusy(false);
    }
  }

  const isSignup = mode === 'signup';

  return (
    <div className="auth-page">
      <div className="auth-modal">
        <section className="auth-panel">
          <Link className="auth-logo-pill" to="/">
            <img src="/logo/logo.png" alt="" width={22} height={22} />
            <span>SAKIYA</span>
          </Link>

          <form className="auth-form" onSubmit={onSubmit}>
            <header className="auth-form-head">
              <h1>
                {isSignup ? t('auth.signupTitle') : t('auth.loginTitle')}
              </h1>
              <p>
                {isSignup ? t('auth.signupLead') : t('auth.loginLead')}
              </p>
            </header>

            {isSignup && (
              <label className="auth-field">
                <span>{t('auth.name')}</span>
                <input
                  type="text"
                  autoComplete="name"
                  required
                  minLength={2}
                  placeholder="Amira Ben Ali"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={busy}
                />
              </label>
            )}

            <label className="auth-field">
              <span>{t('auth.email')}</span>
              <input
                type="email"
                autoComplete="email"
                required
                placeholder="you@farm.tn"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busy}
              />
            </label>

            <label className="auth-field">
              <span>{t('auth.password')}</span>
              <div className="auth-password">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={
                    isSignup ? 'new-password' : 'current-password'
                  }
                  required
                  minLength={6}
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={busy}
                />
                <button
                  type="button"
                  className="auth-eye"
                  aria-label={
                    showPassword ? 'Hide password' : 'Show password'
                  }
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? (
                    <EyeOff size={18} strokeWidth={2} />
                  ) : (
                    <Eye size={18} strokeWidth={2} />
                  )}
                </button>
              </div>
            </label>

            {error && <p className="auth-error">{error}</p>}

            <button
              type="submit"
              className="auth-submit"
              disabled={busy}
            >
              {busy
                ? t('auth.working')
                : isSignup
                  ? t('auth.signupCta')
                  : t('auth.loginCta')}
            </button>

            <div className="auth-foot">
              <p>
                {isSignup ? t('auth.haveAccount') : t('auth.needAccount')}{' '}
                <Link to={isSignup ? '/login' : '/signup'}>
                  {isSignup ? t('auth.loginLink') : t('auth.signupLink')}
                </Link>
              </p>
            </div>
          </form>
        </section>

        <aside className="auth-visual" aria-hidden>
          <img
            className="auth-visual-img"
            src="/hero.jpeg"
            alt=""
            width={900}
            height={1100}
          />
          <div className="auth-visual-veil" />

          <button
            type="button"
            className="auth-close"
            aria-label="Close"
            onClick={() => navigate('/')}
          >
            <X size={18} strokeWidth={2.2} />
          </button>

          <div className="auth-float auth-float-water">
            <Droplets size={16} strokeWidth={2.2} />
            <div>
              <strong>−40% Water</strong>
              <span>Irrigation efficiency</span>
            </div>
          </div>

          <div className="auth-float auth-float-energy">
            <Zap size={16} strokeWidth={2.2} />
            <div>
              <strong>−30% Energy</strong>
              <span>Soft pump windows</span>
            </div>
          </div>

          <div className="auth-float auth-float-crop">
            <Leaf size={16} strokeWidth={2.2} />
            <div>
              <strong>NDVI watch</strong>
              <span>Early crop stress alerts</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
