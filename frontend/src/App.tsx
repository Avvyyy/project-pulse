import { Routes, Route, Navigate } from 'react-router-dom';
import DashboardPage      from './features/dashboard/DashboardPage';
import IncidentListPage   from './features/incidents/IncidentListPage';
import IncidentDetailPage from './features/incidents/IncidentDetailPage';
import AlertListPage      from './features/alerts/AlertListPage';
import AlertDetailPage    from './features/alerts/AlertDetailPage';

export default function App() {
  return (
    <Routes>
      <Route path="/"              element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard"     element={<DashboardPage />} />
      <Route path="/incidents"     element={<IncidentListPage />} />
      <Route path="/incidents/:id" element={<IncidentDetailPage />} />
      <Route path="/alerts"        element={<AlertListPage />} />
      <Route path="/alerts/:id"    element={<AlertDetailPage />} />
    </Routes>
  );
}
