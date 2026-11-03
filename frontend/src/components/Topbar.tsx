import { AppBar, Toolbar, Typography, Box, InputBase, Avatar, Badge, IconButton } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import NotificationsIcon from '@mui/icons-material/Notifications';
import logoAratu from '../assets/aratu-logo.png';
import { useAuth } from '../auth/useAuth';
import { profileInitials, profileLabel } from '../auth/profiles';

export default function Topbar() {
  const { session } = useAuth();
  const nome = session?.nome ?? 'Usuário';
  return (
    <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1, backgroundColor: '#FF6B00', boxShadow: 'none' }}>
      <Toolbar sx={{ justifyContent: 'space-between', minHeight: '64px !important' }}>
        
        {/* Logo */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box 
                component="img" 
                src={logoAratu} 
                alt="Aratu Logo" 
                sx={{ height: 32, width: 'auto', objectFit: 'contain' }} />
              <Typography variant="h6" noWrap component="div" sx={{ fontWeight: 600, color: '#fff', fontSize: '1.1rem' }}>
                Aratu 
              </Typography>
        </Box>

        {/* Barra de Pesquisa */}
        <Box sx={{ position: 'relative', borderRadius: 1, backgroundColor: 'rgb(255, 255, 255)', '&:hover': { backgroundColor: 'rgba(255, 255, 255, 0.25)' }, mr: 2, width: '400px', display: { xs: 'none', md: 'block' } }}>
          <Box sx={{ p: '0 16px', height: '100%', position: 'absolute', pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <SearchIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
          </Box>
          <InputBase
            placeholder="Pesquisar..."
            sx={{ color: 'inherit', width: '100%', '& .MuiInputBase-input': { padding: '8px 8px 8px 45px', fontSize: '0.9rem' } }}
          />
        </Box>

        {/* Perfil e Notificações */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <IconButton color="inherit">
            <Badge badgeContent={1} color="error">
              <NotificationsIcon />
            </Badge>
          </IconButton>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Avatar sx={{ bgcolor: 'primary.main', color: 'primary.contrastText', width: 36, height: 36, fontSize: '0.85rem', fontWeight: 700 }}>{profileInitials(nome)}</Avatar>
            <Box sx={{ display: { xs: 'none', sm: 'block' }, textAlign: 'right' }}>
              <Typography variant="body2" sx={{ fontWeight: 600, color: '#fff', lineHeight: 1.2 }}>{nome}</Typography>
              {session && <Typography variant="caption" sx={{ color: 'text.secondary' }}>{profileLabel(session.perfil)}</Typography>}
            </Box>
          </Box>
        </Box>
      </Toolbar>
    </AppBar>
  );
}