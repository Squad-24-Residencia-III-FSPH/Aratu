import type { ReactNode } from 'react';
import { Box } from '@mui/material';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import Topbar from './Topbar';
import Sidebar from './Sidebar'; 

/** Protege também as entradas legadas e descarta dados visuais ao trocar a sessão. */
export default function Layout({ children }: { children: ReactNode }): ReactNode {
  const { session } = useAuth();
  if (!session) return <Navigate to="/login" replace />;
  return (
    <Box key={session.token} sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: '#f4f6f8' }}>
      
      {/* Barra Superior */}
      <Topbar />

      {/* Container Principal (Menu Lateral + Conteúdo) */}
      <Box sx={{ display: 'flex', flex: 1, mt: '64px' }}>
        
        {/* Menu Lateral */}
        <Sidebar />

        {/* Área Dinâmica onde as páginas (ex: GestorPage) aparecem */}
        <Box component="main" sx={{ flex: 1, minWidth: 0, p: 3 }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
}
