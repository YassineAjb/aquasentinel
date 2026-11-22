import { Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell';
import Analysis from './pages/Analysis';
import AnalysisPicker from './pages/AnalysisPicker';
import CutSheetRX from './pages/CutSheetRX';
import Dashboard from './pages/Dashboard';
import Landing from './pages/Landing';
import Sites from './pages/Sites';
import WaterGuard from './pages/WaterGuard';
import './App.css';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route element={<AppShell />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/sites" element={<Sites />} />
        <Route path="/analysis" element={<AnalysisPicker />} />
        <Route path="/analysis/:siteId" element={<Analysis />} />
        <Route path="/waterguard" element={<WaterGuard />} />
        <Route path="/cutsheetrx" element={<CutSheetRX />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
