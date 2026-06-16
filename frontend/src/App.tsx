import { useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { authApi } from './api/auth';
import { LoginPage } from './features/auth/LoginPage';
import { SignupPage } from './features/auth/SignupPage';
import { ApiKeyDashboard } from './features/settings/ApiKeyDashboard';
import DashboardPage      from './features/dashboard/DashboardPage';
import IncidentListPage   from './features/incidents/IncidentListPage';
import IncidentDetailPage from './features/incidents/IncidentDetailPage';
import AlertListPage      from './features/alerts/AlertListPage';
import AlertDetailPage    from './features/alerts/AlertDetailPage';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, isLoading, setLoading, setUser } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    authApi.me()
      .then(data => { setUser(data.user); setLoading(false); })
      .catch(() => { setUser(null); setLoading(false); navigate('/login'); });
  }, []);

  if (isLoading) return <div className="h-screen w-full flex items-center justify-center bg-canvas text-slate-400">Loading...</div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      
      <Route path="/dashboard"     element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/incidents"     element={<ProtectedRoute><IncidentListPage /></ProtectedRoute>} />
      <Route path="/incidents/:id" element={<ProtectedRoute><IncidentDetailPage /></ProtectedRoute>} />
      <Route path="/alerts"        element={<ProtectedRoute><AlertListPage /></ProtectedRoute>} />
      <Route path="/alerts/:id"    element={<ProtectedRoute><AlertDetailPage /></ProtectedRoute>} />
      <Route path="/settings/api-keys" element={<ProtectedRoute><ApiKeyDashboard /></ProtectedRoute>} />
    </Routes>
  );
}
