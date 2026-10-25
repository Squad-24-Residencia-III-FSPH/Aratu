import { Box } from '@mui/material';
import { Outlet } from 'react-router-dom';
import Topbar from './Topbar';
import Sidebar from './Sidebar'; 

export default function Layout() {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: '#f4f6f8' }}>
      
      {/* Barra Superior */}
      <Topbar />

      {/* Container Principal (Menu Lateral + Conteúdo) */}
      <Box sx={{ display: 'flex', flex: 1, mt: '56px' }}>
        
        {/* Menu Lateral */}
        <Sidebar />

        {/* Área Dinâmica onde as páginas (ex: GestorPage) aparecem */}
        <Box component="main" sx={{ flex: 1, ml: '60px', p: 3 }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}