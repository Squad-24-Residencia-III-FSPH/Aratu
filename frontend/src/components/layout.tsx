import type { ReactNode } from 'react';
import { Box, useMediaQuery, useTheme } from '@mui/material';
import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { resolveProfile } from '../auth/profiles';
import { tokenUserId } from '../auth/token';
import Topbar from './Topbar';
import Sidebar from './Sidebar'; 
import MobileNavigation from './MobileNavigation';

/** Protege também as entradas legadas e descarta dados visuais ao trocar a sessão. */
export default function Layout({ children }: { children: ReactNode }): ReactNode {
  const { session } = useAuth();
  const theme = useTheme();
  const isCompactViewport = useMediaQuery(theme.breakpoints.down('sm'));
  const isWideDesktop = useMediaQuery(theme.breakpoints.up('lg'));
  const [sidebarExpanded, setSidebarExpanded] = useState<boolean | null>(null);
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const effectiveSidebarExpanded = sidebarExpanded ?? isWideDesktop;
  const profile = session ? resolveProfile(session.perfil) : null;
  const sessionIdentity = session ? `${tokenUserId(session.token) ?? 'unknown'}:${profile ?? 'unknown'}` : 'anonymous';
  if (!session) return <Navigate to="/login" replace />;
  return (
    <Box key={sessionIdentity} sx={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', backgroundColor: 'background.default' }}>
      
      {/* Barra Superior */}
      <Topbar
        isCompactViewport={isCompactViewport}
        navigationExpanded={isCompactViewport ? mobileNavigationOpen : effectiveSidebarExpanded}
        onMenuToggle={() => isCompactViewport
          ? setMobileNavigationOpen((open) => !open)
          : setSidebarExpanded((expanded) => !(expanded ?? isWideDesktop))}
      />

      {/* Container Principal (Menu Lateral + Conteúdo) */}
      <Box sx={{ display: 'flex', flex: 1, mt: '64px' }}>
        
        {/* Menu Lateral */}
        <Sidebar
          expanded={effectiveSidebarExpanded}
          mobileOpen={mobileNavigationOpen}
          onMobileClose={() => setMobileNavigationOpen(false)}
        />

        {/* Área Dinâmica onde as páginas (ex: GestorPage) aparecem */}
        <Box
          component="main"
          sx={{
            flex: 1,
            minWidth: 0,
            px: { xs: 2, sm: 3 },
            py: { xs: 2, sm: 3 },
            pb: { xs: 'calc(88px + env(safe-area-inset-bottom, 0px))', sm: 3 },
            overflowX: 'clip',
          }}
        >
          <Box sx={{ width: '100%', maxWidth: 1400, minWidth: 0, mx: 'auto' }}>
            {children}
          </Box>
        </Box>
      </Box>
      <MobileNavigation
        profile={profile}
        permissions={session?.permissions}
        onMenuClick={() => setMobileNavigationOpen(true)}
      />
    </Box>
  );
}
