import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import GestorPage from './pages/GestorPage/GestorPage';
import LoginPage from './pages/loginpage/LoginPage';

export default function App() {
  return (
    <HashRouter>
      <Routes>
        {/* Rota de Login */}
        <Route path="/login" element={<LoginPage />} />

        {/* Rotas do Sistema protegidas/envoltas pelo Layout (Topbar + Sidebar) */}
        <Route path="/" element={<Layout />}>
          <Route index element={<GestorPage />} />
        </Route>

        {/* Redirecionamento para qualquer rota desconhecida */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}