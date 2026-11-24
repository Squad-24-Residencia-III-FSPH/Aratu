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
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { Link as RouterLink, useLocation } from 'react-router-dom';

import { useAuth } from '../auth/useAuth';
import { profileInitials, profileLabel, resolveProfile } from '../auth/profiles';
import { getSidebarNavigation } from './sidebarNavigation';
import type { SidebarMenuItem } from './sidebarNavigation';
import { NAVIGATION_ICONS } from './navigationIcons'

const drawerWidthExpanded = 260;
const drawerWidthCollapsed = 72;

interface SidebarProps {
  expanded: boolean
  mobileOpen: boolean
  onMobileClose: () => void
  onAction: (item: SidebarMenuItem) => void
}

export default function Sidebar({ expanded: desktopExpanded, mobileOpen, onMobileClose, onAction }: SidebarProps) {
  const theme = useTheme();
  const isCompactViewport = useMediaQuery(theme.breakpoints.down('sm'));
  const location = useLocation();
  const { session } = useAuth();

  const profile = session ? resolveProfile(session.perfil) : null;
  const navigation = getSidebarNavigation(profile);
  const roleLabel = session ? profileLabel(session.perfil) : 'Usuário';
  const expanded = isCompactViewport ? mobileOpen : desktopExpanded;

  const currentWidth = expanded ? drawerWidthExpanded : drawerWidthCollapsed;
  const drawerWidth = isCompactViewport ? drawerWidthExpanded : currentWidth;

  const selectedStyle = {
    borderRadius: 1,
    backgroundColor: 'rgba(255, 107, 0, 0.08) !important',
    color: '#111827',
    minHeight: 44,
    justifyContent: expanded ? 'initial' : 'center',
    px: expanded ? 2 : 1.5,
    '& .MuiListItemIcon-root': { color: '#FF6B00' },
    '&:hover': { backgroundColor: 'rgba(255, 107, 0, 0.12)' },
  };

  const defaultStyle = {
    borderRadius: 1,
    minHeight: 44,
    justifyContent: expanded ? 'initial' : 'center',
    px: expanded ? 2 : 1.5,
    '&:hover': { backgroundColor: '#df68061e' },
  };

  const renderItemText = (text: string) => {
    if (!expanded) return null;
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
    const Icon = NAVIGATION_ICONS[item.icon];
    const isSelected = Boolean(item.path && location.pathname === item.path);
    const itemStyle = isSelected ? selectedStyle : defaultStyle;

    const content = (
      <ListItemButton
        {...(item.behavior === 'link' && item.path ? { component: RouterLink, to: item.path, 'aria-current': isSelected ? 'page' as const : undefined } : {})}
        selected={isSelected}
        onClick={() => {
          if (item.behavior === 'action') onAction(item)
          if (isCompactViewport) onMobileClose()
        }}
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
        <Tooltip title={!expanded ? item.label : ''} {...tooltipProps}>
          {content}
        </Tooltip>
      </ListItem>
    );
  };

  return (
    <Box sx={{ display: 'flex', position: 'relative', flexShrink: 0, width: isCompactViewport ? 0 : currentWidth }}>
      <Drawer
        variant={isCompactViewport ? 'temporary' : 'permanent'}
        open={!isCompactViewport || mobileOpen}
        onClose={onMobileClose}
        slotProps={{
          root: { keepMounted: true },
          paper: { id: 'primary-navigation', 'aria-label': 'Navegação principal' },
        }}
        sx={{
          width: isCompactViewport ? 0 : currentWidth,
          flexShrink: 0,
          transition: 'width 0.2s ease-in-out',
          '& .MuiDrawer-paper': {
            width: drawerWidth,
            boxSizing: 'border-box',
            backgroundColor: '#fff',
            borderRight: '1px solid #e2e8f0',
            mt: '64px',
            height: 'calc(100vh - 64px)',
            '@supports (height: 100dvh)': { height: 'calc(100dvh - 64px)' },
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
        <Box sx={{ p: expanded ? 2 : 1, pb: 4, height: '100%' }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: expanded ? 'space-between' : 'center',
              mb: 1.5,
              px: expanded ? 1 : 0,
              minHeight: 32,
            }}
          >
            {expanded && (
              <Typography
                variant="caption"
                sx={{
                  color: '#FF6B00',
                  fontWeight: 700,
                  display: 'block',
                  whiteSpace: 'nowrap',
                }}
              >
                {roleLabel}
              </Typography>
            )}

            {!expanded && (
              <Typography
                variant="caption"
                sx={{
                  color: '#FF6B00',
                  fontWeight: 700,
                  display: 'block',
                }}
              >
                {profileInitials(roleLabel)}
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
              {expanded && (
                <Typography variant="caption" sx={{ color: '#FF6B00', fontWeight: 700, px: 2, mt: section.spaced ? 2 : 1, display: 'block', fontSize: '0.7rem' }}>
                  {section.label}
                </Typography>
              )}
              <List dense disablePadding>
                {section.items.map((item) => renderSidebarItem(item))}
              </List>
            </Box>
          ))}

        </Box>
      </Drawer>

    </Box>
  );
}
