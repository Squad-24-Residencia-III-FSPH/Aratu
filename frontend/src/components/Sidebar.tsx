import { useState } from 'react';
import {
  Box,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  Divider,
  Tooltip,
  IconButton,
} from '@mui/material';
import { useNavigate, useLocation } from 'react-router-dom';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import Home from '@mui/icons-material/Home';
import Assignment from '@mui/icons-material/Assignment';
import LocalShipping from '@mui/icons-material/LocalShipping';
import CheckCircle from '@mui/icons-material/CheckCircle';
import DirectionsCar from '@mui/icons-material/DirectionsCar';
import Person from '@mui/icons-material/Person';
import Build from '@mui/icons-material/Build';
import LocalGasStation from '@mui/icons-material/LocalGasStation';
import Description from '@mui/icons-material/Description';
import Warning from '@mui/icons-material/Warning';
import DashboardIcon from '@mui/icons-material/Dashboard';
import BarChart from '@mui/icons-material/BarChart';
import Security from '@mui/icons-material/Security';
import Help from '@mui/icons-material/Help';
import { useAuth } from '../auth/useAuth';
import { PROFILE_HOMES } from '../auth/profiles';

const drawerWidthExpanded = 260;
const drawerWidthCollapsed = 72;

export default function Sidebar() {
  const [isExpanded, setIsExpanded] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  const { session } = useAuth();

  const isActive = (path: string) => location.pathname === path;
  const currentWidth = isExpanded ? drawerWidthExpanded : drawerWidthCollapsed;

  const toggleSidebar = () => {
    setIsExpanded((prev) => !prev);
  };

  const selectedStyle = {
    borderRadius: 1,
    backgroundColor: 'rgba(255, 107, 0, 0.08) !important',
    color: '#111827',
    minHeight: 40,
    justifyContent: isExpanded ? 'initial' : 'center',
    px: isExpanded ? 2 : 1.5,
    '& .MuiListItemIcon-root': { color: '#FF6B00' },
    '&:hover': { backgroundColor: 'rgba(255, 107, 0, 0.12)' },
  };

  const defaultStyle = {
    borderRadius: 1,
    minHeight: 40,
    justifyContent: isExpanded ? 'initial' : 'center',
    px: isExpanded ? 2 : 1.5,
    '&:hover': { backgroundColor: '#df68061e' },
  };

  const renderItemText = (text: string, path?: string) => {
    if (!isExpanded) return null;
    const active = path ? isActive(path) : false;
    return (
      <ListItemText
        primary={
          <Typography component="span" sx={{ fontSize: '0.875rem', fontWeight: active ? 600 : 400, whiteSpace: 'nowrap' }}>
            {text}
          </Typography>
        }
      />
    );
  };
  const tooltipProps = {
    arrow: true,
    placement: 'right' as const,
    slotProps: {
      tooltip: {
        sx: {
          backgroundColor: '#FF6B00',
          color: '#ffffff',
          fontWeight: 600,
          fontSize: '0.75rem',
          boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.15)',
        },
      },
      arrow: {
        sx: {
          color: '#FF6B00',
        },
      },
    },
  };

  return (
    <Box sx={{ display: 'flex', position: 'relative', flexShrink: 0 }}>
      <Drawer
        variant="permanent"
        sx={{
          width: currentWidth,
          flexShrink: 0,
          transition: 'width 0.2s ease-in-out',
          '& .MuiDrawer-paper': {
            width: currentWidth,
            boxSizing: 'border-box',
            backgroundColor: '#fff',
            borderRight: '1px solid #e2e8f0',
            mt: '64px',
            height: 'calc(100vh - 64px)',
            overflowX: 'hidden',
            overflowY: 'auto',
            scrollbarWidth: 'none',
            '&::-webkit-scrollbar': {
              display: 'none',
            },
            transition: 'width 0.2s ease-in-out',
          },
        }}
      >
        <Box sx={{ p: isExpanded ? 2 : 1, pb: 4, height: '100%' }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: isExpanded ? 'space-between' : 'center',
              mb: 1.5,
              px: isExpanded ? 1 : 0,
              minHeight: 32,
            }}
          >
            {isExpanded && (
              <Typography
                variant="caption"
                sx={{
                  color: '#FF6B00',
                  fontWeight: 700,
                  display: 'block',
                  whiteSpace: 'nowrap',
                }}
              >
                Gestor de Frota
              </Typography>
            )}

            {!isExpanded && (
              <Typography
                variant="caption"
                sx={{
                  color: '#FF6B00',
                  fontWeight: 700,
                  display: 'block',
                }}
              >
                GF
              </Typography>
            )}
          </Box>

          <List disablePadding>
            <ListItem disablePadding sx={{ mb: 0.5 }}>
              <Tooltip title={!isExpanded ? 'Início' : ''} {...tooltipProps}>
                <ListItemButton
                  selected={isActive('/')}
                  onClick={() => navigate('/')}
                  sx={isActive('/') ? selectedStyle : defaultStyle}
                >
                  <ListItemIcon sx={{ color: isActive('/') ? '#FF6B00' : 'inherit', minWidth: 36, justifyContent: 'center' }}>
                    <Home fontSize="small" />
                  </ListItemIcon>
                  {renderItemText('Início', '/')}
                </ListItemButton>
              </Tooltip>
            </ListItem>
          </List>

          <Divider sx={{ my: 2 }} />

          {isExpanded && (
            <Typography variant="caption" sx={{ color: '#FF6B00', fontWeight: 700, px: 2, fontSize: '0.7rem', display: 'block' }}>
              OPERAÇÃO
            </Typography>
          )}
          <List dense disablePadding>
            <ListItem disablePadding>
              <Tooltip title={!isExpanded ? 'Solicitações' : ''} {...tooltipProps}>
                <ListItemButton sx={defaultStyle}>
                  <ListItemIcon sx={{ minWidth: 36, justifyContent: 'center' }}><Assignment fontSize="small" /></ListItemIcon>
                  {renderItemText('Solicitações')}
                </ListItemButton>
              </Tooltip>
            </ListItem>
            <ListItem disablePadding>
              <Tooltip title={!isExpanded ? 'Viagens' : ''} {...tooltipProps}>
                <ListItemButton sx={defaultStyle}>
                  <ListItemIcon sx={{ minWidth: 36, justifyContent: 'center' }}><LocalShipping fontSize="small" /></ListItemIcon>
                  {renderItemText('Viagens')}
                </ListItemButton>
              </Tooltip>
            </ListItem>
            <ListItem disablePadding>
              <Tooltip title={!isExpanded ? 'Confirmar viagens' : ''} {...tooltipProps}>
                <ListItemButton sx={defaultStyle}>
                  <ListItemIcon sx={{ minWidth: 36, justifyContent: 'center' }}><CheckCircle fontSize="small" /></ListItemIcon>
                  {renderItemText('Confirmar viagens')}
                </ListItemButton>
              </Tooltip>
            </ListItem>
          </List>

          {isExpanded && (
            <Typography variant="caption" sx={{ color: '#FF6B00', fontWeight: 700, px: 2, mt: 2, display: 'block', fontSize: '0.7rem' }}>
              FROTA
            </Typography>
          )}
          <List dense disablePadding>
            <ListItem disablePadding>
              <Tooltip title={!isExpanded ? 'Veículos' : ''} {...tooltipProps}>
                <ListItemButton
                  selected={isActive('/veiculos')}
                  onClick={() => navigate('/veiculos')}
                  sx={isActive('/veiculos') ? selectedStyle : defaultStyle}
                >
                  <ListItemIcon sx={{ minWidth: 36, justifyContent: 'center', color: isActive('/veiculos') ? '#FF6B00' : 'inherit' }}>
                    <DirectionsCar fontSize="small" />
                  </ListItemIcon>
                  {renderItemText('Veículos', '/veiculos')}
                </ListItemButton>
              </Tooltip>
            </ListItem>

            <ListItem disablePadding>
              <Tooltip title={!isExpanded ? 'Motoristas' : ''} {...tooltipProps}>
                <ListItemButton sx={defaultStyle}>
                  <ListItemIcon sx={{ minWidth: 36, justifyContent: 'center' }}><Person fontSize="small" /></ListItemIcon>
                  {renderItemText('Motoristas')}
                </ListItemButton>
              </Tooltip>
            </ListItem>

            <ListItem disablePadding>
              <Tooltip title={!isExpanded ? 'Tipos de serviço' : ''} {...tooltipProps}>
                <ListItemButton sx={defaultStyle}>
                  <ListItemIcon sx={{ minWidth: 36, justifyContent: 'center' }}><Assignment fontSize="small" /></ListItemIcon>
                  {renderItemText('Tipos de serviço')}
                </ListItemButton>
              </Tooltip>
            </ListItem>

            <ListItem disablePadding>
              <Tooltip title={!isExpanded ? 'Manutenção' : ''} {...tooltipProps}>
                <ListItemButton
                  selected={isActive('/manutencao')}
                  onClick={() => navigate('/manutencao')}
                  sx={isActive('/manutencao') ? selectedStyle : defaultStyle}
                >
                  <ListItemIcon sx={{ minWidth: 36, justifyContent: 'center', color: isActive('/manutencao') ? '#FF6B00' : 'inherit' }}>
                    <Build fontSize="small" />
                  </ListItemIcon>
                  {renderItemText('Manutenção', '/manutencao')}
                </ListItemButton>
              </Tooltip>
            </ListItem>

            <ListItem disablePadding>
              <Tooltip title={!isExpanded ? 'Abastecimento' : ''} {...tooltipProps}>
                <ListItemButton sx={defaultStyle}>
                  <ListItemIcon sx={{ minWidth: 36, justifyContent: 'center' }}><LocalGasStation fontSize="small" /></ListItemIcon>
                  {renderItemText('Abastecimento')}
                </ListItemButton>
              </Tooltip>
            </ListItem>
          </List>

          {isExpanded && (
            <Typography variant="caption" sx={{ color: '#FF6B00', fontWeight: 700, px: 2, mt: 2, display: 'block', fontSize: '0.7rem' }}>
              CONTROLE
            </Typography>
          )}
          <List dense disablePadding>
            <ListItem disablePadding>
              <Tooltip title={!isExpanded ? 'Documentos' : ''} {...tooltipProps}>
                <ListItemButton sx={defaultStyle}>
                  <ListItemIcon sx={{ minWidth: 36, justifyContent: 'center' }}><Description fontSize="small" /></ListItemIcon>
                  {renderItemText('Documentos')}
                </ListItemButton>
              </Tooltip>
            </ListItem>
            <ListItem disablePadding>
              <Tooltip title={!isExpanded ? 'Multas e Infrações' : ''} {...tooltipProps}>
                <ListItemButton sx={defaultStyle}>
                  <ListItemIcon sx={{ minWidth: 36, justifyContent: 'center' }}><Warning fontSize="small" /></ListItemIcon>
                  {renderItemText('Multas e Infrações')}
                </ListItemButton>
              </Tooltip>
            </ListItem>
          </List>

          {isExpanded && (
            <Typography variant="caption" sx={{ color: '#FF6B00', fontWeight: 700, px: 2, mt: 2, display: 'block', fontSize: '0.7rem' }}>
              GESTÃO
            </Typography>
          )}
          <List dense disablePadding>
            {session?.perfil === 'ADMINISTRADOR' && (
              <ListItem disablePadding>
                <Tooltip title={!isExpanded ? 'Usuários' : ''} {...tooltipProps}>
                  <ListItemButton
                    component="a"
                    href={`#${PROFILE_HOMES.ADMINISTRADOR.path}`}
                    sx={defaultStyle}
                  >
                    <ListItemIcon sx={{ minWidth: 36, justifyContent: 'center' }}><Security fontSize="small" /></ListItemIcon>
                    {renderItemText('Usuários')}
                  </ListItemButton>
                </Tooltip>
              </ListItem>
            )}

            <ListItem disablePadding>
              <Tooltip title={!isExpanded ? 'Dashboard' : ''} {...tooltipProps}>
                <ListItemButton sx={defaultStyle}>
                  <ListItemIcon sx={{ minWidth: 36, justifyContent: 'center' }}><DashboardIcon fontSize="small" /></ListItemIcon>
                  {renderItemText('Dashboard')}
                </ListItemButton>
              </Tooltip>
            </ListItem>

            <ListItem disablePadding>
              <Tooltip title={!isExpanded ? 'Relatórios' : ''} {...tooltipProps}>
                <ListItemButton sx={defaultStyle}>
                  <ListItemIcon sx={{ minWidth: 36, justifyContent: 'center' }}><BarChart fontSize="small" /></ListItemIcon>
                  {renderItemText('Relatórios')}
                </ListItemButton>
              </Tooltip>
            </ListItem>

            <ListItem disablePadding>
              <Tooltip title={!isExpanded ? 'Auditoria' : ''} {...tooltipProps}>
                <ListItemButton sx={defaultStyle}>
                  <ListItemIcon sx={{ minWidth: 36, justifyContent: 'center' }}><Security fontSize="small" /></ListItemIcon>
                  {renderItemText('Auditoria')}
                </ListItemButton>
              </Tooltip>
            </ListItem>
          </List>

          <Divider sx={{ my: 2 }} />

          <List dense disablePadding>
            <ListItem disablePadding>
              <Tooltip title={!isExpanded ? 'Ajuda' : ''} {...tooltipProps}>
                <ListItemButton sx={defaultStyle}>
                  <ListItemIcon sx={{ minWidth: 36, justifyContent: 'center' }}><Help fontSize="small" /></ListItemIcon>
                  {renderItemText('Ajuda')}
                </ListItemButton>
              </Tooltip>
            </ListItem>
          </List>
        </Box>
      </Drawer>

      <Tooltip title={isExpanded ? 'Recolher menu' : 'Expandir menu'} {...tooltipProps}>
        <IconButton
          onClick={toggleSidebar}
          size="small"
          sx={{
            position: 'absolute',
            top: 'calc(64px + 120px)',
            left: currentWidth - 14,
            zIndex: 1300,
            backgroundColor: '#ffffff',
            color: '#FF6B00',
            border: '1px solid #e2e8f0',
            width: 28,
            height: 28,
            boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
            transition: 'left 0.2s ease-in-out',
            '&:hover': {
              backgroundColor: '#fff7ed',
              borderColor: '#FF6B00',
            },
          }}
        >
          {isExpanded ? <ChevronLeftIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
        </IconButton>
      </Tooltip>
    </Box>
  );
}