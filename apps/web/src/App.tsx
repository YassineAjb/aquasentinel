import { useEffect, useState, type ComponentType } from 'react';
import {
  ChartSpline,
  Home,
  LayoutDashboard,
  MapPinned,
  Mountain,
  PanelLeftClose,
  ShieldAlert,
  type LucideProps,
} from 'lucide-react';
import { NavLink, Route, Routes } from 'react-router-dom';
import AssistantFloat from './components/AssistantFloat';
import { LOCALES, useLanguage, type Locale } from './i18n';
import Analysis from './pages/Analysis';
import AnalysisPicker from './pages/AnalysisPicker';
import CutSheetRX from './pages/CutSheetRX';
import Dashboard from './pages/Dashboard';
import Landing from './pages/Landing';
import Sites from './pages/Sites';
import WaterGuard from './pages/WaterGuard';
import './App.css';

type NavIcon = ComponentType<LucideProps>;

const NAV: {
  to: string;
  labelKey: string;
  end?: boolean;
  Icon: NavIcon;
}[] = [
  { to: '/', labelKey: 'nav.home', end: true, Icon: Home },
  { to: '/dashboard', labelKey: 'nav.dashboard', Icon: LayoutDashboard },
  { to: '/sites', labelKey: 'nav.sites', Icon: MapPinned },
  { to: '/analysis', labelKey: 'nav.analysis', Icon: ChartSpline },
  { to: '/waterguard', labelKey: 'nav.waterguard', Icon: ShieldAlert },
  { to: '/cutsheetrx', labelKey: 'nav.cutsheetrx', Icon: Mountain },
];

const STORAGE_KEY = 'aquasentinel-nav-collapsed';

export default function App() {
  const { t, locale, setLocale } = useLanguage();
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
            aria-label={collapsed ? t('nav.expand') : 'AquaSentinel'}
            title={collapsed ? t('nav.expand') : undefined}
          >
            {collapsed ? (
              <img
                className="brand-logo"
                src="/logo/logo1.png"
                alt=""
                width={40}
                height={40}
              />
            ) : (
              <span className="brand-copy">
                <span className="brand-mark">AquaSentinel</span>
                <span className="brand-tag">{t('brand.tag')}</span>
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
          {NAV.map(({ to, labelKey, end, Icon }) => {
            const label = t(labelKey);
            return (
              <NavLink
                key={to}
                to={to}
                end={end}
                className="app-nav-link"
                title={label}
              >
                <Icon className="app-nav-icon" size={18} strokeWidth={2} aria-hidden />
                <span className="app-nav-label">{label}</span>
              </NavLink>
            );
          })}
        </nav>
        <div className="app-lang" role="group" aria-label={t('nav.language')}>
          {LOCALES.map((l) => (
            <button
              key={l.id}
              type="button"
              className={`app-lang-btn${locale === l.id ? ' is-active' : ''}`}
              aria-pressed={locale === l.id}
              title={l.label}
              onClick={() => setLocale(l.id as Locale)}
            >
              {collapsed ? l.native : l.label}
            </button>
          ))}
        </div>
      </aside>
      <div className="app-main">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/sites" element={<Sites />} />
          <Route path="/analysis" element={<AnalysisPicker />} />
          <Route path="/analysis/:siteId" element={<Analysis />} />
          <Route path="/waterguard" element={<WaterGuard />} />
          <Route path="/cutsheetrx" element={<CutSheetRX />} />
        </Routes>
        <AssistantFloat />
      </div>
    </div>
  );
}
