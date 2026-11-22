import { Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell';
import ProtectedRoute from './components/ProtectedRoute';
import Analysis from './pages/Analysis';
import AnalysisPicker from './pages/AnalysisPicker';
import Auth from './pages/Auth';
import CutSheetRX from './pages/CutSheetRX';
import Dashboard from './pages/Dashboard';
import Landing from './pages/Landing';
import Sites from './pages/Sites';
import WaterGuard from './pages/WaterGuard';
import { useAuth } from './auth';
import './App.css';

function HomeRedirect() {
  const { user, ready } = useAuth();
  if (!ready) return null;
  return <Navigate to={user ? '/dashboard' : '/'} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Auth mode="login" />} />
      <Route path="/signup" element={<Auth mode="signup" />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/sites" element={<Sites />} />
          <Route path="/analysis" element={<AnalysisPicker />} />
          <Route path="/analysis/:siteId" element={<Analysis />} />
          <Route path="/waterguard" element={<WaterGuard />} />
          <Route path="/cutsheetrx" element={<CutSheetRX />} />
        </Route>
      </Route>

      <Route path="/home" element={<HomeRedirect />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
