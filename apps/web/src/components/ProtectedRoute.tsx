import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth';

export default function ProtectedRoute() {
  const { user, ready } = useAuth();
  const location = useLocation();

  if (!ready) {
    return (
      <div className="auth-loading">
        <div className="dash-bg" aria-hidden />
        <p>Loading…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <Navigate to="/login" replace state={{ from: location.pathname }} />
    );
  }

  return <Outlet />;
}
