import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Layout from './components/layout';
import GestorPage from './pages/gestor/gestorPage/GestorPage';
import GestorDashboardPage from './pages/gestor/gestorPage/DashboardPage';
import TripAgendaPage from './pages/gestor/gestorPage/TripAgendaPage';
import LoginPage from './pages/loginPage/LoginPage';
import ProfilePermissionsPage from './pages/profilePermissionsPage/ProfilePermissionsPage';
import SolicitacaoPage from './pages/SolicitacaoPage/SolicitacaoPage';
import VehiclesPage from './pages/gestor/vehiclesPage/VehiclesPage';
import MaintenancePage from './pages/gestor/ManuPage/ManutencaoPage';
import { useAuth } from './auth/useAuth';
import { PROFILE_HOMES } from './auth/profiles';
import type { Profile } from './auth/profiles';
import { resolveRoute } from './routing/routeDecision';
import UserManagementPage from './pages/userManagementPage/UserManagementPage';
import DriversPage from './pages/driversPage/DriversPage';
import FuelingsPage from './pages/fuelingsPage/FuelingsPage';
import MyTripsPage from './pages/myTripsPage/MyTripsPage';
import TripConfirmationPage from './pages/tripConfirmationPage/TripConfirmationPage';
import ScheduleTripPage from './pages/gestor/schedulingPage/ScheduleTripPage';
import SvoTeamOrdersPage from './pages/svoOrdersPage/SvoTeamOrdersPage';
import SvoOrdersPage from './pages/svoOrdersPage/SvoOrdersPage';
import RequestAnalysisPage from './pages/requestAnalysisPage/RequestAnalysisPage';
import ReportsPage from './pages/reportsPage/ReportsPage';
import VehicleDocumentsPage from './pages/vehicleDocumentsPage/VehicleDocumentsPage';
import FinesPage from './pages/finesPage/FinesPage';
import SvoOccurrencesPage from './pages/svoOccurrencesPage/SvoOccurrencesPage';
import AuditLogsPage from './pages/auditLogsPage/AuditLogsPage';
import ServicesPage from './pages/gestor/servicePage/ServicesPage';
import SvoTeamsPage from './pages/svoTeamsPage/SvoTeamsPage';

function LoginRoute() {
  const { session } = useAuth();
  const { pathname } = useLocation();
  const decision = resolveRoute(session, pathname);
  if (decision.kind === 'login') return <LoginPage />;
  if (decision.kind === 'svo-occurrences') {
    return <Navigate to={PROFILE_HOMES[decision.profile].path} replace />;
  }
  const target = decision.kind === 'redirect' ? decision.to : PROFILE_HOMES[decision.profile].path;
  return <Navigate to={target} replace />;
}

function ProfileHome({ profile }: { profile: Profile }) {
  switch (profile) {
    case 'GESTOR':
      return <GestorPage />;
    case 'ADMINISTRADOR':
      return <UserManagementPage />;
    case 'MOTORISTA':
      return <MyTripsPage />;
    case 'SOLICITANTE':
      return <SolicitacaoPage />;
    case 'ATENDENTE_SVO':
      return <SvoOccurrencesPage />;
    case 'EQUIPE_SVO':
      return <SvoTeamOrdersPage />;
  }
}

function PrivateRoute() {
  const { session } = useAuth();
  const { pathname, search } = useLocation();
  const decision = resolveRoute(session, pathname);
  if (decision.kind === 'redirect') {
    const target = decision.preserveSearch ? `${decision.to}${search}` : decision.to;
    return <Navigate to={target} replace />;
  }
  if (decision.kind === 'login') return <Navigate to="/login" replace />;
  if (decision.kind === 'profile-permissions') return <Layout><ProfilePermissionsPage /></Layout>;
  if (decision.kind === 'vehicles') return <Layout><VehiclesPage /></Layout>;
  if (decision.kind === 'maintenance') return <Layout><MaintenancePage /></Layout>;
  if (decision.kind === 'reports') return <Layout><ReportsPage /></Layout>;
  if (decision.kind === 'audit') return <Layout><AuditLogsPage /></Layout>;
  if (decision.kind === 'svo-occurrences') return <Layout><SvoOccurrencesPage /></Layout>;
  if (decision.kind === 'svo-teams') return <Layout><SvoTeamsPage /></Layout>;
  if (decision.kind === 'vehicle-documents') return <Layout><VehicleDocumentsPage /></Layout>;
  if (decision.kind === 'fines') return <Layout><FinesPage /></Layout>;
  if (decision.kind === 'drivers') return <Layout><DriversPage /></Layout>;
  if (decision.kind === 'fuelings') return <Layout><FuelingsPage /></Layout>;
  if (decision.kind === 'trip-confirmation') return <Layout><TripConfirmationPage /></Layout>;
  if (decision.kind === 'trip-agenda') return <Layout><TripAgendaPage /></Layout>;
  if (decision.kind === 'service-types') return <Layout><ServicesPage /></Layout>;
  if (decision.kind === 'trip-scheduling') return <Layout><ScheduleTripPage /></Layout>;
  if (decision.kind === 'dashboard') return <Layout><GestorDashboardPage /></Layout>;
  if (decision.kind === 'svo-orders') return <Layout><SvoOrdersPage /></Layout>;
  if (decision.kind === 'request-analysis') return <Layout><RequestAnalysisPage /></Layout>;
  return (
    <Layout>
      <ProfileHome profile={decision.profile} />
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
