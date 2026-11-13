import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Layout from './components/layout';
import GestorPage from './pages/gestor/gestorPage/GestorPage';
import LoginPage from './pages/loginPage/LoginPage';
import PlaceholderPage from './pages/placeholderPage/PlaceholderPage';
import ProfilePermissionsPage from './pages/profilePermissionsPage/ProfilePermissionsPage';
import SolicitacaoPage from './pages/SolicitacaoPage/SolicitacaoPage';
import VehiclesPage from './pages/gestor/vehiclesPage/VehiclesPage';
import MaintenancePage from './pages/gestor/ManuPage/ManutencaoPage';
import { useAuth } from './auth/useAuth';
import { PROFILE_HOMES } from './auth/profiles';
import type { Profile } from './auth/profiles';
import { resolveRoute } from './routing/routeDecision';
import UserManagementPage from './pages/UserManagementPage';
import DriversPage from './pages/DriversPage';
import FuelingsPage from './pages/FuelingsPage';
import MyTripsPage from './pages/MyTripsPage';
import TripConfirmationPage from './pages/TripConfirmationPage';
import ServicesPage from './pages/gestor/servicePage/ServicesPage';
import ScheduleTripPage from './pages/gestor/schedulingPage/ScheduleTripPage';

function LoginRoute() {
  const { session } = useAuth();
  const { pathname } = useLocation();
  const decision = resolveRoute(session, pathname);
  if (decision.kind === 'login') return <LoginPage />;
  const target = decision.kind === 'redirect' ? decision.to : PROFILE_HOMES[decision.profile].path;
  return <Navigate to={target} replace />;
}

function ProfileHome({ profile }: { profile: Profile }) {
  if (profile === 'GESTOR') return <GestorPage />;
  if (profile === 'ADMINISTRADOR') return <UserManagementPage />;
  if (profile === 'MOTORISTA') return <MyTripsPage />;
  if (profile === 'SOLICITANTE') return <SolicitacaoPage />;
  return <PlaceholderPage title={PROFILE_HOMES[profile].title} />;
}

function PrivateRoute() {
  const { session } = useAuth();
  const { pathname } = useLocation();
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
  if (decision.kind === 'vehicles') {
    return (
      <Layout>
        <VehiclesPage />
      </Layout>
    );
  }
  if (decision.kind === 'maintenance') return <Layout><MaintenancePage /></Layout>;
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
  if (decision.kind === 'service-types') return <Layout><ServicesPage /></Layout>
  if (decision.kind === 'trip-scheduling') return <Layout><ScheduleTripPage /></Layout>
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
        <Route
          path="/minhas-solicitacoes"
          element={
            <Layout>
              <SolicitacaoPage />
            </Layout>
          }
        />
        <Route path="*" element={<PrivateRoute />} />
      </Routes>
    </HashRouter>
  );
}
