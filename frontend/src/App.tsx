import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Layout from './components/layout';
import GestorPage from './pages/gestor/gestorPage/GestorPage';
import GestorDashboardPage from './pages/gestor/gestorPage/DashboardPage';
import LoginPage from './pages/loginPage/LoginPage';
import PlaceholderPage from './pages/placeholderPage/PlaceholderPage';
import ProfilePermissionsPage from './pages/profilePermissionsPage/ProfilePermissionsPage';
import SolicitacaoPage from './pages/SolicitacaoPage/SolicitacaoPage';
import VehiclesPage from './pages/gestor/vehiclesPage/VehiclesPage';
import MaintenancePage from './pages/gestor/ManuPage/ManutencaoPage';
import { useAuth } from './auth/useAuth';
import { PROFILE_HOMES } from './auth/profiles';
import { authorizedHomePath } from './auth/access';
import type { Profile } from './auth/profiles';
import { resolveRoute } from './routing/routeDecision';
import UserManagementPage from './pages/userManagementPage/UserManagementPage';
import DriversPage from './pages/driversPage/DriversPage';
import FuelingsPage from './pages/fuelingsPage/FuelingsPage';
import MyTripsPage from './pages/myTripsPage/MyTripsPage';
import TripConfirmationPage from './pages/tripConfirmationPage/TripConfirmationPage';
import TripAgendaPage from './pages/tripAgendaPage/TripAgendaPage';
import ScheduleTripPage from './pages/gestor/schedulingPage/ScheduleTripPage';
import SvoTeamOrdersPage from './pages/svoOrdersPage/SvoTeamOrdersPage';
import SvoOrdersPage from './pages/svoOrdersPage/SvoOrdersPage';
import RequestAnalysisPage from './pages/requestAnalysisPage/RequestAnalysisPage';
import ReportsPage from './pages/reportsPage/ReportsPage';
import AuditLogsPage from './pages/AuditLogsPage';
import SvoOccurrencesPage from './pages/SvoOccurrencesPage';
import ServicesPage from './pages/gestor/servicePage/ServicesPage';
import SvoTeamsPage from './pages/svoTeamsPage/SvoTeamsPage';
import VehicleDocumentsPage from './pages/vehicleDocumentsPage/VehicleDocumentsPage';
import FinesPage from './pages/finesPage/FinesPage';
import StateFeedback from './components/ui/StateFeedback';

function LoginRoute() {
  const { session, authorizationError, refreshAuthorization } = useAuth();
  const { pathname } = useLocation();
  if (session && session.permissions === undefined) {
    return authorizationError
      ? <StateFeedback kind="error" title="Não foi possível carregar seu perfil de acesso" description={authorizationError}
          actionLabel="Tentar novamente" onAction={refreshAuthorization} />
      : <StateFeedback kind="loading" title="Carregando permissões..." />;
  }
  if (session && authorizedHomePath(session) === '/login') {
    return <StateFeedback kind="forbidden" title="Perfil sem acesso operacional" description="Peça à Administração que associe ao menos uma permissão ao seu perfil." />;
  }
  const decision = resolveRoute(session, pathname);
  if (decision.kind === 'login') return <LoginPage />;
  const target = decision.kind === 'redirect' ? decision.to : session ? authorizedHomePath(session) : '/login';
  return <Navigate to={target} replace />;
}

function ProfileHome({ profile, title }: { profile: Profile | null; title: string }) {
  if (!profile) return <PlaceholderPage title={title} />;
  if (profile === 'GESTOR') return <GestorPage />;
  if (profile === 'ADMINISTRADOR') return <UserManagementPage />;
  if (profile === 'MOTORISTA') return <MyTripsPage />;
  if (profile === 'SOLICITANTE') return <SolicitacaoPage />;
  if (profile === 'EQUIPE_SVO') return <SvoTeamOrdersPage />;
  return <PlaceholderPage title={PROFILE_HOMES[profile].title} />;
}

function PrivateRoute() {
  const { session, authorizationError, refreshAuthorization } = useAuth();
  const { pathname } = useLocation();
  if (session && session.permissions === undefined) {
    return authorizationError
      ? <StateFeedback kind="error" title="Não foi possível carregar seu perfil de acesso" description={authorizationError}
          actionLabel="Tentar novamente" onAction={refreshAuthorization} />
      : <StateFeedback kind="loading" title="Carregando permissões..." />;
  }
  const decision = resolveRoute(session, pathname);
  if (decision.kind === 'redirect') return <Navigate to={decision.to} replace />;
  if (decision.kind === 'login') return <Navigate to="/login" replace />;
  if (decision.kind === 'profile-permissions') {
    return (
      <Layout>
        <ProfilePermissionsPage />
      </Layout>
    );
  }
  if (decision.kind === 'users') return <Layout><UserManagementPage /></Layout>;
  if (decision.kind === 'vehicles') {
    return (
      <Layout>
        <VehiclesPage />
      </Layout>
    );
  }
  if (decision.kind === 'maintenance') return <Layout><MaintenancePage /></Layout>;
  if (decision.kind === 'reports') return <Layout><ReportsPage /></Layout>;
  if (decision.kind === 'audit') return <Layout><AuditLogsPage /></Layout>;
  if (decision.kind === 'svo-occurrences') return <Layout><SvoOccurrencesPage /></Layout>;
  if (decision.kind === 'svo-teams') return <Layout><SvoTeamsPage /></Layout>;
  if (decision.kind === 'vehicle-documents') return <Layout><VehicleDocumentsPage /></Layout>;
  if (decision.kind === 'fines') return <Layout><FinesPage /></Layout>;
  if (decision.kind === 'drivers') {
    return (
      <Layout>
        <DriversPage />
      </Layout>
    );
  }
  if (decision.kind === 'fuelings') {
    return (
      <Layout>
        <FuelingsPage />
      </Layout>
    );
  }
  if (decision.kind === 'trip-confirmation') return <Layout><TripConfirmationPage /></Layout>;
  if (decision.kind === 'trip-agenda') return <Layout><TripAgendaPage /></Layout>;
  if (decision.kind === 'service-types') return <Layout><ServicesPage /></Layout>;
  if (decision.kind === 'trip-scheduling') return <Layout><ScheduleTripPage /></Layout>
  if (decision.kind === 'dashboard') return <Layout><GestorDashboardPage /></Layout>
  if (decision.kind === 'svo-orders') return <Layout><SvoOrdersPage /></Layout>
  if (decision.kind === 'svo-team-orders') return <Layout><SvoTeamOrdersPage /></Layout>
  if (decision.kind === 'request-analysis') return <Layout><RequestAnalysisPage /></Layout>
  return (
    <Layout>
      <ProfileHome profile={decision.profile} title={session?.profile?.displayName ?? session?.perfil ?? 'Início'} />
    </Layout>
  );
}

export default function App() {
  return (
    <HashRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <Routes>
        <Route path="/login" element={<LoginRoute />} />
        <Route path="*" element={<PrivateRoute />} />
      </Routes>
    </HashRouter>
  );
}
