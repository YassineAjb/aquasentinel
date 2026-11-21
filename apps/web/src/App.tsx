import { useEffect, useState, type ComponentType } from 'react';
import {
  ChartSpline,
  Home,
  LayoutDashboard,
  MapPinned,
  PanelLeftClose,
  type LucideProps,
} from 'lucide-react';
import { NavLink, Route, Routes } from 'react-router-dom';
import Analysis from './pages/Analysis';
import AnalysisPicker from './pages/AnalysisPicker';
import Dashboard from './pages/Dashboard';
import Landing from './pages/Landing';
import Sites from './pages/Sites';
import './App.css';

type NavIcon = ComponentType<LucideProps>;

const NAV: {
  to: string;
  label: string;
  end?: boolean;
  Icon: NavIcon;
}[] = [
  { to: '/', label: 'Home', end: true, Icon: Home },
  { to: '/dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { to: '/sites', label: 'Sites', Icon: MapPinned },
  { to: '/analysis', label: 'Analysis', Icon: ChartSpline },
];

const STORAGE_KEY = 'aquasentinel-nav-collapsed';

export default function App() {
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
      <aside className="app-nav" aria-label="Main">
        <div className="app-nav-top">
          <button
            type="button"
            className="app-nav-brand"
            onClick={() => {
              if (collapsed) setCollapsed(false);
            }}
            aria-label={collapsed ? 'Expand sidebar' : 'AquaSentinel'}
            title={collapsed ? 'Expand sidebar' : undefined}
          >
            {collapsed ? (
              <img
                className="brand-logo"
                src="/logo.png"
                alt=""
                width={40}
                height={40}
              />
            ) : (
              <span className="brand-copy">
                <span className="brand-mark">AquaSentinel</span>
                <span className="brand-tag">Water · energy · food</span>
              </span>
            )}
          </button>
          {!collapsed && (
            <button
              type="button"
              className="app-nav-toggle"
              aria-expanded
              aria-label="Collapse sidebar"
              title="Collapse"
              onClick={() => setCollapsed(true)}
            >
              <PanelLeftClose size={16} strokeWidth={2} aria-hidden />
            </button>
          )}
        </div>
        <nav>
          {NAV.map(({ to, label, end, Icon }) => (
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
          ))}
        </nav>
      </aside>
      <div className="app-main">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/sites" element={<Sites />} />
          <Route path="/analysis" element={<AnalysisPicker />} />
          <Route path="/analysis/:siteId" element={<Analysis />} />
        </Routes>
      </div>
    </div>
  );
}
