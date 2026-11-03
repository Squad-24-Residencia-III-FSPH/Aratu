import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Layout from './components/layout';
import GestorPage from './pages/gestorPage/GestorPage';
import LoginPage from './pages/loginPage/LoginPage';
import PlaceholderPage from './pages/placeholderPage/PlaceholderPage';
import ProfilePermissionsPage from './pages/profilePermissionsPage/ProfilePermissionsPage';
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
  if (profile === 'GESTOR') return <GestorPage />;
  if (profile === 'ADMINISTRADOR') return <UserManagementPage />;
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
  return (
    <Layout>
      <ProfileHome profile={decision.profile} />
    </Layout>
  );
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<LoginRoute />} />
        <Route path="*" element={<PrivateRoute />} />
      </Routes>
    </HashRouter>
  );
}
