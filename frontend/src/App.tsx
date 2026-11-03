import { HashRouter, Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import Layout from './components/layout';
import GestorPage from './pages/gestorPage/GestorPage';
import LoginPage from './pages/loginPage/LoginPage';
import PlaceholderPage from './pages/placeholderPage/PlaceholderPage';
import ScheduleTripPage from './pages/ScheduleTripPage';
import { useAuth } from './auth/useAuth';
import { PROFILE_HOMES } from './auth/profiles';
import type { Profile } from './auth/profiles';
import { resolveRoute } from './routing/routeDecision';
import UserManagementPage from './pages/UserManagementPage';

function LoginRoute() {
  const { session } = useAuth();
  const { pathname } = useLocation();
  const decision = resolveRoute(session, pathname);
  if (decision.kind === 'login') return <LoginPage />;
  if (decision.kind === 'redirect') return <Navigate to={decision.to} replace />;
  if (decision.kind === 'home') return <Navigate to={PROFILE_HOMES[decision.profile].path} replace />;
  if (decision.kind === 'schedule-trip') return <Navigate to={`/frota/agendar-viagem/${decision.requestId}`} replace />;
  return <Navigate to="/preview/agendamento" replace />;
}

function ProfileHome({ profile }: { profile: Profile }) {
  if (profile === 'GESTOR') return <GestorPage />;
  if (profile === 'ADMINISTRADOR') return <UserManagementPage />;
  return <PlaceholderPage title={PROFILE_HOMES[profile].title} />;
}

function PreviewScheduleRoute() {
  const { requestId } = useParams<{ requestId?: string }>();
  return (
    <Layout>
      <ScheduleTripPage requestId={requestId || '123'} />
    </Layout>
  );
}

function PrivateRoute() {
  const { session } = useAuth();
  const { pathname } = useLocation();
  const decision = resolveRoute(session, pathname);
  if (decision.kind === 'redirect') return <Navigate to={decision.to} replace />;
  if (decision.kind === 'login') return <Navigate to="/login" replace />;
  if (decision.kind === 'schedule-trip') {
    return (
      <Layout>
        <ScheduleTripPage requestId={decision.requestId} />
      </Layout>
    );
  }
  if (decision.kind === 'home') {
    return (
      <Layout>
        <ProfileHome profile={decision.profile} />
      </Layout>
    );
  }
  return (
    <Layout>
      <ScheduleTripPage requestId={decision.requestId} />
    </Layout>
  );
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<LoginRoute />} />
        <Route path="/preview/agendamento" element={<PreviewScheduleRoute />} />
        <Route path="/preview/agendamento/:requestId" element={<PreviewScheduleRoute />} />
        <Route path="*" element={<PrivateRoute />} />
      </Routes>
    </HashRouter>
  );
}
