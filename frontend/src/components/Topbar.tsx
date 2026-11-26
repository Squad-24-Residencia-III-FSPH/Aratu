import { useState } from 'react';
import { AppBar, Toolbar, Typography, Box, Button, IconButton, Menu, MenuItem, Divider, ListItemIcon, ListItemText } from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import MenuIcon from '@mui/icons-material/Menu';
import logoAratu from '../assets/aratu-logo-black-white.png';
import { useAuth } from '../auth/useAuth';
import { profileLabel } from '../auth/profiles';

interface TopbarProps {
  isCompactViewport: boolean
  navigationExpanded: boolean
  onMenuToggle: () => void
}

export default function Topbar({ isCompactViewport, navigationExpanded, onMenuToggle }: TopbarProps) {
  const { session, logout } = useAuth();
  const nome = session?.nome ?? 'Usuário';
  const perfil = session ? profileLabel(session.perfil, session.profile?.displayName) : '';
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
    <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1, backgroundColor: 'primary.main', color: 'primary.contrastText', boxShadow: 'none' }}>
      <Toolbar sx={{ justifyContent: 'space-between', minHeight: '64px !important', px: { xs: 1, sm: 3 }, gap: 1 }}>

        {/* Logo */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <IconButton
            type="button"
            aria-label={isCompactViewport
              ? navigationExpanded ? 'Fechar menu' : 'Abrir menu'
              : navigationExpanded ? 'Recolher menu' : 'Expandir menu'}
            aria-controls="primary-navigation"
            aria-expanded={navigationExpanded}
            onClick={onMenuToggle}
            sx={{
              color: '#111827',
              width: 44,
              height: 44,
              alignSelf: 'center',
              display: isCompactViewport ? 'none' : 'grid',
              placeItems: 'center',
              '&:hover': { backgroundColor: 'rgba(17, 24, 39, 0.08)' },
              '&.Mui-focusVisible': { outline: '2px solid #111827', outlineOffset: 2 },
            }}
          >
            <MenuIcon aria-hidden="true" />
          </IconButton>
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
              {perfil && <Typography variant="caption" sx={{ color: '#111827' }}>{perfil}</Typography>}
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
