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
import { Link as RouterLink, useLocation } from 'react-router-dom';
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
import AdminPanelSettings from '@mui/icons-material/AdminPanelSettings';
import type { SvgIconComponent } from '@mui/icons-material';

import { useAuth } from '../auth/useAuth';
import { resolveProfile } from '../auth/profiles';
import { getSidebarNavigation } from './sidebarNavigation';
import type { SidebarIconName, SidebarMenuItem } from './sidebarNavigation';

const drawerWidthExpanded = 260;
const drawerWidthCollapsed = 72;

const icons: Record<SidebarIconName, SvgIconComponent> = {
  home: Home,
  users: Person,
  permissions: AdminPanelSettings,
  audit: Security,
  settings: Build,
  requests: Assignment,
  trips: LocalShipping,
  confirmTrips: CheckCircle,
  vehicles: DirectionsCar,
  drivers: Person,
  serviceTypes: Assignment,
  maintenance: Build,
  fuel: LocalGasStation,
  documents: Description,
  warnings: Warning,
  dashboard: DashboardIcon,
  reports: BarChart,
  help: Help,
};

export default function Sidebar() {
  const [isExpanded, setIsExpanded] = useState(true);
  const location = useLocation();
  const { session } = useAuth();

  const profile = session ? resolveProfile(session.perfil) : null;
  const navigation = getSidebarNavigation(profile);

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

  const renderItemText = (text: string) => {
    if (!isExpanded) return null;
    return (
      <ListItemText
        primary={
          <Typography component="span" sx={{ fontSize: '0.875rem', whiteSpace: 'nowrap' }}>
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

  const renderSidebarItem = (item: SidebarMenuItem) => {
    const Icon = icons[item.icon] || Home;
    const isSelected = item.path ? location.pathname === item.path : item.selected;
    const itemStyle = isSelected ? selectedStyle : defaultStyle;

    const content = (
      <ListItemButton
        {...(item.behavior === 'link' && item.path ? { component: RouterLink, to: item.path } : {})}
        selected={isSelected}
        sx={itemStyle}
      >
        <ListItemIcon sx={{ minWidth: 36, justifyContent: 'center', color: isSelected ? '#FF6B00' : 'inherit' }}>
          <Icon fontSize="small" />
        </ListItemIcon>
        {renderItemText(item.label)}
      </ListItemButton>
    );

    return (
      <ListItem disablePadding key={item.label} sx={{ mb: 0.5 }}>
        <Tooltip title={!isExpanded ? item.label : ''} {...tooltipProps}>
          {content}
        </Tooltip>
      </ListItem>
    );
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

          {/* Top Items */}
          <List disablePadding>
            {navigation.topItems.map((item) => renderSidebarItem(item))}
          </List>

          {navigation.showDividerAfterTop && <Divider sx={{ my: 2 }} />}

          {/* Seções Dinâmicas */}
          {navigation.sections.map((section) => (
            <Box key={section.label}>
              {isExpanded && (
                <Typography variant="caption" sx={{ color: '#FF6B00', fontWeight: 700, px: 2, mt: section.spaced ? 2 : 1, display: 'block', fontSize: '0.7rem' }}>
                  {section.label}
                </Typography>
              )}
              <List dense disablePadding>
                {section.items.map((item) => renderSidebarItem(item))}
              </List>
            </Box>
          ))}

          <Divider sx={{ my: 2 }} />

          {/* Footer Items */}
          <List dense disablePadding>
            {navigation.footerItems.map((item) => renderSidebarItem(item))}
          </List>
        </Box>
      </Drawer>

      {/* Botão de Recolher/Expandir */}
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