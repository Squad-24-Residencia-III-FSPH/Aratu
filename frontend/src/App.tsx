import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Layout from './components/layout';
import GestorPage from './pages/gestorPage/GestorPage';
import LoginPage from './pages/loginPage/LoginPage';
import PlaceholderPage from './pages/placeholderPage/PlaceholderPage';
import VeiculosPage from './pages/veiculosPage/VeiculosPage';
import ManutencaoPage from './pages/ManuPage/ManutencaoPage';
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
  const target = decision.kind === 'redirect' ? decision.to : PROFILE_HOMES[decision.profile].path;
  return <Navigate to={target} replace />;
}

function ProfileHome({ profile }: { profile: Profile }) {
  const { pathname } = useLocation();
  if (profile === 'GESTOR') {
    if (pathname === '/manutencao') return <ManutencaoPage />;
    if (pathname === '/veiculos') return <VeiculosPage />;
    return <GestorPage />;
  }
  if (profile === 'ADMINISTRADOR') return <UserManagementPage />;
  return <PlaceholderPage title={PROFILE_HOMES[profile].title} />;
}

function PrivateRoute() {
  const { session } = useAuth();
  const { pathname } = useLocation();
  const decision = resolveRoute(session, pathname);
  if (decision.kind === 'redirect') return <Navigate to={decision.to} replace />;
  if (decision.kind === 'login') return <Navigate to="/login" replace />;
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
        <Route path="/veiculos" element={<PrivateRouteWrapper><VeiculosPage /></PrivateRouteWrapper>} />
        <Route path="/manutencao" element={<PrivateRouteWrapper><ManutencaoPage /></PrivateRouteWrapper>} />
        <Route path="*" element={<PrivateRoute />} />
      </Routes>
    </HashRouter>
  );
}

function PrivateRouteWrapper({ children }: { children: React.ReactNode }) {
  return <Layout>{children}</Layout>;
}