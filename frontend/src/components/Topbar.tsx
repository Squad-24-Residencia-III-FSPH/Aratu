import { useState } from 'react';
import { AppBar, Toolbar, Typography, Box, Button, Menu, MenuItem, Divider, ListItemIcon, ListItemText } from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import logoAratu from '../assets/aratu-logo-black-white.png';
import { useAuth } from '../auth/useAuth';
import { profileLabel } from '../auth/profiles';

export default function Topbar() {
  const { session, logout } = useAuth();
  const nome = session?.nome ?? 'Usuário';
  const perfil = session ? profileLabel(session.perfil) : '';
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const isMenuOpen = Boolean(menuAnchor);

  function closeAccountMenu() {
    setMenuAnchor(null);
  }

  function handleLogout() {
    closeAccountMenu();
    logout();
  }

  return (
    <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1, backgroundColor: '#FF6B00', boxShadow: 'none' }}>
      <Toolbar sx={{ justifyContent: 'space-between', minHeight: '64px !important', px: { xs: 1, sm: 3 }, gap: 1 }}>

        {/* Logo */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            component="img"
            src={logoAratu}
            alt="Aratu — Sistema de Gestão de Frota"
            sx={{ height: 32, width: 'auto', objectFit: 'contain' }}
          />
          <Typography variant="h6" noWrap component="div" sx={{ display: { xs: 'none', sm: 'block' }, fontWeight: 600, color: '#111827', fontSize: '1.1rem' }}>
            Aratu
          </Typography>
        </Box>

        {/* Acesso à conta */}
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Button
            id="account-menu-button"
            type="button"
            aria-label={`Conta de ${nome}${perfil ? `, perfil ${perfil}` : ''}`}
            aria-haspopup="menu"
            aria-expanded={isMenuOpen}
            aria-controls={isMenuOpen ? 'account-menu' : undefined}
            onClick={(event) => setMenuAnchor(event.currentTarget)}
            endIcon={<ExpandMoreIcon aria-hidden="true" />}
            sx={{
              color: 'primary.contrastText',
              minWidth: 44,
              minHeight: 44,
              px: { xs: 0.5, sm: 1.5 },
              gap: { xs: 0, sm: 1 },
              borderRadius: 2,
              '& .MuiButton-endIcon': { ml: { xs: 0, sm: 0.5 } },
              '& .MuiButton-endIcon svg': {
                transition: 'transform 160ms ease',
                transform: isMenuOpen ? 'rotate(180deg)' : 'rotate(0deg)',
              },
              '&:hover': { backgroundColor: 'rgba(17, 24, 39, 0.08)' },
              '&.Mui-focusVisible': { outline: '2px solid #111827', outlineOffset: 2 },
            }}
          >
            <Box sx={{ display: { xs: 'none', sm: 'block' }, textAlign: 'right' }}>
              <Typography variant="body2" sx={{ fontWeight: 600, color: '#111827', lineHeight: 1.2 }}>
                {nome}
              </Typography>
              {perfil && <Typography variant="caption" sx={{ color: 'text.secondary' }}>{perfil}</Typography>}
            </Box>
            <Typography component="span" variant="body2" sx={{ display: { xs: 'block', sm: 'none' }, color: '#111827' }}>
              Conta
            </Typography>
          </Button>
          <Menu
            id="account-menu"
            anchorEl={menuAnchor}
            open={isMenuOpen}
            onClose={closeAccountMenu}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            slotProps={{
              list: { 'aria-labelledby': 'account-menu-button' },
              paper: { sx: { minWidth: 240, mt: 1, borderRadius: 2 } },
            }}
          >
            <Box sx={{ px: 2, py: 1.5 }}>
              <Typography variant="body2" sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{nome}</Typography>
              {perfil && <Typography variant="caption" color="text.secondary">{perfil}</Typography>}
            </Box>
            <Divider />
            <MenuItem onClick={handleLogout} sx={{ minHeight: 48 }}>
              <ListItemIcon><LogoutIcon fontSize="small" aria-hidden="true" /></ListItemIcon>
              <ListItemText>Sair</ListItemText>
            </MenuItem>
          </Menu>
        </Box>
      </Toolbar>
    </AppBar>
  );
}
