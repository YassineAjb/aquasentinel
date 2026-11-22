import { useCallback, useEffect, useState, type ComponentType } from 'react';
import {
  ChartSpline,
  LayoutDashboard,
  LogOut,
  MapPinned,
  Moon,
  Mountain,
  PanelLeftClose,
  ShieldAlert,
  Sun,
  type LucideProps,
} from 'lucide-react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import AssistantFloat from './AssistantFloat';
import FirstRunTutorial, {
  TutorialHelpButton,
  useTutorialGate,
} from './FirstRunTutorial';
import FlagIcon from './FlagIcon';
import { LOCALES, useLanguage, type Locale } from '../i18n';
import { useTheme } from '../theme';

type NavIcon = ComponentType<LucideProps>;

const NAV: {
  to: string;
  labelKey: string;
  Icon: NavIcon;
}[] = [
  { to: '/dashboard', labelKey: 'nav.dashboard', Icon: LayoutDashboard },
  { to: '/sites', labelKey: 'nav.sites', Icon: MapPinned },
  { to: '/analysis', labelKey: 'nav.analysis', Icon: ChartSpline },
  { to: '/waterguard', labelKey: 'nav.waterguard', Icon: ShieldAlert },
  { to: '/cutsheetrx', labelKey: 'nav.cutsheetrx', Icon: Mountain },
];

const STORAGE_KEY = 'sakiya-nav-collapsed';

const TOUR_TARGETS: Record<string, string> = {
  '/dashboard': 'nav-dashboard',
  '/sites': 'nav-sites',
  '/analysis': 'nav-analysis',
  '/waterguard': 'nav-waterguard',
  '/cutsheetrx': 'nav-cutsheetrx',
};

export default function AppShell() {
  const { t, locale, setLocale } = useLanguage();
  const { theme, setTheme } = useTheme();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { open: tourOpen, setOpen: setTourOpen, start: startTour } =
    useTutorialGate();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  const expandNav = useCallback(() => setCollapsed(false), []);

  return (
    <div className={`app-shell${collapsed ? ' nav-collapsed' : ''}`}>
      <aside className="app-nav" aria-label={t('nav.main')}>
        <div className="app-nav-top">
          <button
            type="button"
            className="app-nav-brand"
            onClick={() => {
              if (collapsed) setCollapsed(false);
            }}
            aria-label={collapsed ? t('nav.expand') : 'SAKIYA'}
            title={collapsed ? t('nav.expand') : undefined}
          >
            <img
              className="brand-logo"
              src="/logo/logo.png"
              alt=""
              width={40}
              height={40}
            />
            {!collapsed && (
              <span className="brand-copy">
                <span className="brand-mark">SAKIYA</span>
              </span>
            )}
          </button>
          {!collapsed && (
            <button
              type="button"
              className="app-nav-toggle"
              aria-expanded
              aria-label={t('nav.collapse')}
              title={t('nav.collapse')}
              onClick={() => setCollapsed(true)}
            >
              <PanelLeftClose size={16} strokeWidth={2} aria-hidden />
            </button>
          )}
        </div>
        <nav>
          {NAV.map(({ to, labelKey, Icon }) => {
            const label = t(labelKey);
            return (
              <NavLink
                key={to}
                to={to}
                className="app-nav-link"
                title={label}
                data-tour={TOUR_TARGETS[to]}
              >
                <Icon
                  className="app-nav-icon"
                  size={18}
                  strokeWidth={2}
                  aria-hidden
                />
                <span className="app-nav-label">{label}</span>
              </NavLink>
            );
          })}
        </nav>
        <div
          className="app-lang"
          role="group"
          aria-label={t('nav.language')}
          data-tour="nav-language"
        >
          {LOCALES.map((l) => (
            <button
              key={l.id}
              type="button"
              className={`app-lang-btn${locale === l.id ? ' is-active' : ''}`}
              aria-pressed={locale === l.id}
              title={l.label}
              onClick={() => setLocale(l.id as Locale)}
            >
              <FlagIcon locale={l.id} />
              {!collapsed && <span>{l.label}</span>}
            </button>
          ))}
          <div className="app-theme" role="group" aria-label={t('nav.theme')}>
            <button
              type="button"
              className={`app-theme-btn${theme === 'light' ? ' is-active' : ''}`}
              aria-pressed={theme === 'light'}
              title={t('nav.themeLight')}
              onClick={() => setTheme('light')}
            >
              <Sun size={15} strokeWidth={2} aria-hidden />
              {!collapsed && <span>{t('nav.themeLight')}</span>}
            </button>
            <button
              type="button"
              className={`app-theme-btn${theme === 'dark' ? ' is-active' : ''}`}
              aria-pressed={theme === 'dark'}
              title={t('nav.themeDark')}
              onClick={() => setTheme('dark')}
            >
              <Moon size={15} strokeWidth={2} aria-hidden />
              {!collapsed && <span>{t('nav.themeDark')}</span>}
            </button>
          </div>
          <TutorialHelpButton onClick={startTour} />
          {(user || !collapsed) && (
            <button
              type="button"
              className="app-lang-btn app-logout-btn"
              title={t('auth.logout')}
              onClick={() => {
                logout();
                navigate('/login', { replace: true });
              }}
            >
              <LogOut size={15} strokeWidth={2} aria-hidden />
              {!collapsed && (
                <span className="app-logout-label">
                  {user?.name || t('auth.logout')}
                </span>
              )}
            </button>
          )}
        </div>
      </aside>
      <div className="app-main">
        <Outlet />
        <AssistantFloat />
      </div>
      <FirstRunTutorial
        open={tourOpen}
        onOpenChange={setTourOpen}
        onExpandNav={expandNav}
      />
    </div>
  );
}
