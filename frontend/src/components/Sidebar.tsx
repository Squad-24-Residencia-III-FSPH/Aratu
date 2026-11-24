import { useCallback, useId, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
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
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import Add from '@mui/icons-material/Add';
import AdminPanelSettings from '@mui/icons-material/AdminPanelSettings';
import Assignment from '@mui/icons-material/Assignment';
import AssignmentTurnedIn from '@mui/icons-material/AssignmentTurnedIn';
import BarChart from '@mui/icons-material/BarChart';
import Build from '@mui/icons-material/Build';
import Category from '@mui/icons-material/Category';
import CheckCircle from '@mui/icons-material/CheckCircle';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DashboardIcon from '@mui/icons-material/Dashboard';
import Description from '@mui/icons-material/Description';
import DirectionsCar from '@mui/icons-material/DirectionsCar';
import EventAvailable from '@mui/icons-material/EventAvailable';
import Help from '@mui/icons-material/Help';
import Home from '@mui/icons-material/Home';
import LocalGasStation from '@mui/icons-material/LocalGasStation';
import LocalShipping from '@mui/icons-material/LocalShipping';
import MedicalServices from '@mui/icons-material/MedicalServices';
import MenuIcon from '@mui/icons-material/Menu';
import Person from '@mui/icons-material/Person';
import Security from '@mui/icons-material/Security';
import Visibility from '@mui/icons-material/Visibility';
import Warning from '@mui/icons-material/Warning';
import type { SvgIconComponent } from '@mui/icons-material';

import { useAuth } from '../auth/useAuth';
import { profileInitials, profileLabel, resolveProfile } from '../auth/profiles';
import { getSidebarNavigation } from './sidebarNavigation';
import type { SidebarIconName, SidebarMenuItem, SidebarNavigation } from './sidebarNavigation';

const drawerWidthExpanded = 260;
const drawerWidthCollapsed = 72;
const brandTextColor = '#b94700';

const icons: Record<SidebarIconName, SvgIconComponent> = {
  home: Home,
  users: Person,
  permissions: AdminPanelSettings,
  audit: Security,
  settings: Build,
  requests: Assignment,
  newRequest: Add,
  analyzeRequests: AssignmentTurnedIn,
  svoRequests: MedicalServices,
  svoTracking: Visibility,
  tripAgenda: EventAvailable,
  trips: LocalShipping,
  confirmTrips: CheckCircle,
  vehicles: DirectionsCar,
  drivers: Person,
  serviceTypes: Category,
  maintenance: Build,
  fuel: LocalGasStation,
  documents: Description,
  warnings: Warning,
  dashboard: DashboardIcon,
  reports: BarChart,
  help: Help,
};

const tooltipProps = {
  arrow: true,
  placement: 'right' as const,
  slotProps: {
    tooltip: {
      sx: {
        backgroundColor: brandTextColor,
        color: '#ffffff',
        fontWeight: 600,
        fontSize: '0.75rem',
        boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.15)',
      },
    },
    arrow: {
      sx: {
        color: brandTextColor,
      },
    },
  },
};

function matchesPathAndQuery(itemPath: string, pathname: string, search: string): { matched: boolean; hasQuery: boolean } {
  const [targetPath, targetQuery = ''] = itemPath.split('?');
  if (pathname !== targetPath) return { matched: false, hasQuery: Boolean(targetQuery) };
  if (!targetQuery) return { matched: true, hasQuery: false };

  const currentParams = new URLSearchParams(search);
  const expectedParams = new URLSearchParams(targetQuery);
  for (const [key, value] of expectedParams.entries()) {
    if (currentParams.get(key) !== value) return { matched: false, hasQuery: true };
  }
  return { matched: true, hasQuery: true };
}

interface SidebarNavContentProps {
  navigation: SidebarNavigation;
  roleLabel: string;
  showLabels: boolean;
  isCompactViewport: boolean;
  showMobileDrawer: boolean;
  mobileDrawerId: string;
  mobileToggleRef: RefObject<HTMLButtonElement | null>;
  pathname: string;
  search: string;
  hasQuerySpecificMatch: boolean;
  onOpenMobile: () => void;
  onCloseMobile: () => void;
  onNavigate?: () => void;
}

function SidebarNavContent({
  navigation,
  roleLabel,
  showLabels,
  isCompactViewport,
  showMobileDrawer,
  mobileDrawerId,
  mobileToggleRef,
  pathname,
  search,
  hasQuerySpecificMatch,
  onOpenMobile,
  onCloseMobile,
  onNavigate,
}: SidebarNavContentProps) {
  const selectedStyle = {
    borderRadius: 1,
    backgroundColor: 'rgba(255, 107, 0, 0.12) !important',
    color: '#111827',
    minHeight: 44,
    minWidth: 44,
    scrollMarginTop: '80px',
    justifyContent: showLabels ? 'initial' : 'center',
    px: showLabels ? 2 : 1.5,
    '& .MuiListItemIcon-root': { color: brandTextColor },
    '&:hover': { backgroundColor: 'rgba(255, 107, 0, 0.16)' },
    '&.Mui-focusVisible, &:focus-visible': {
      outline: `3px solid ${brandTextColor}`,
      outlineOffset: 2,
    },
  };

  const defaultStyle = {
    borderRadius: 1,
    minHeight: 44,
    minWidth: 44,
    scrollMarginTop: '80px',
    color: '#111827',
    justifyContent: showLabels ? 'initial' : 'center',
    px: showLabels ? 2 : 1.5,
    '&:hover': { backgroundColor: '#df68061e' },
    '&.Mui-focusVisible, &:focus-visible': {
      outline: `3px solid ${brandTextColor}`,
      outlineOffset: 2,
    },
  };

  const renderSidebarItem = (item: SidebarMenuItem) => {
    const Icon = icons[item.icon] || Home;
    const match = matchesPathAndQuery(item.path, pathname, search);
    const isSelected = match.matched && (match.hasQuery || !hasQuerySpecificMatch);
    const itemStyle = isSelected ? selectedStyle : defaultStyle;

    const content = (
      <ListItemButton
        {...(item.behavior === 'link' ? { component: RouterLink, to: item.path } : {})}
        selected={isSelected}
        aria-current={isSelected ? 'page' : undefined}
        aria-label={!showLabels ? item.label : undefined}
        onClick={onNavigate}
        sx={itemStyle}
      >
        <ListItemIcon sx={{ minWidth: showLabels ? 36 : 0, justifyContent: 'center', color: isSelected ? brandTextColor : '#374151' }}>
          <Icon fontSize="small" aria-hidden="true" />
        </ListItemIcon>
        {showLabels && (
          <ListItemText
            primary={
              <Typography component="span" sx={{ fontSize: '0.875rem', whiteSpace: 'nowrap', fontWeight: isSelected ? 600 : 400 }}>
                {item.label}
              </Typography>
            }
          />
        )}
      </ListItemButton>
    );

    return (
      <ListItem disablePadding key={`${item.label}:${item.path}`} sx={{ mb: 0.5 }}>
        <Tooltip title={!showLabels ? item.label : ''} {...tooltipProps}>
          {content}
        </Tooltip>
      </ListItem>
    );
  };

  return (
    <Box component="nav" aria-label="Menu principal" sx={{ p: showLabels ? 2 : 1, pb: 4, height: '100%' }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: showLabels ? 'space-between' : 'center',
          flexDirection: showLabels ? 'row' : 'column',
          gap: showLabels ? 1 : 0.5,
          mb: 1.5,
          px: showLabels ? 1 : 0,
          minHeight: 32,
        }}
      >
        {showLabels ? (
          <Typography
            variant="caption"
            sx={{
              color: brandTextColor,
              fontWeight: 700,
              display: 'block',
              whiteSpace: 'nowrap',
            }}
          >
            {roleLabel}
          </Typography>
        ) : (
          <Typography
            variant="caption"
            sx={{
              color: brandTextColor,
              fontWeight: 700,
              display: 'block',
            }}
          >
            {profileInitials(roleLabel)}
          </Typography>
        )}

        {isCompactViewport && !showLabels && (
          <IconButton
            ref={mobileToggleRef}
            type="button"
            onClick={onOpenMobile}
            aria-label="Expandir menu"
            aria-expanded={showMobileDrawer}
            aria-controls={mobileDrawerId}
            sx={{
              width: 44,
              height: 44,
              color: brandTextColor,
              border: '1px solid #cbd5e1',
              backgroundColor: '#ffffff',
              '&:hover': { backgroundColor: '#fff7ed', borderColor: brandTextColor },
              '&.Mui-focusVisible, &:focus-visible': {
                outline: `3px solid ${brandTextColor}`,
                outlineOffset: 2,
              },
            }}
          >
            <MenuIcon fontSize="small" aria-hidden="true" />
          </IconButton>
        )}

        {isCompactViewport && showLabels && (
          <IconButton
            type="button"
            onClick={onCloseMobile}
            aria-label="Recolher menu"
            sx={{
              width: 44,
              height: 44,
              color: brandTextColor,
              '&:hover': { backgroundColor: '#fff7ed' },
              '&.Mui-focusVisible, &:focus-visible': {
                outline: `3px solid ${brandTextColor}`,
                outlineOffset: 2,
              },
            }}
          >
            <ChevronLeftIcon fontSize="small" aria-hidden="true" />
          </IconButton>
        )}
      </Box>

      <List disablePadding>
        {navigation.topItems.map((item) => renderSidebarItem(item))}
      </List>

      {navigation.showDividerAfterTop && navigation.sections.length > 0 && <Divider sx={{ my: 2 }} />}

      {navigation.sections.map((section) => (
        <Box key={section.label}>
          {showLabels && (
            <Typography variant="caption" sx={{ color: brandTextColor, fontWeight: 700, px: 2, mt: section.spaced ? 2 : 1, display: 'block', fontSize: '0.7rem' }}>
              {section.label}
            </Typography>
          )}
          <List dense disablePadding>
            {section.items.map((item) => renderSidebarItem(item))}
          </List>
        </Box>
      ))}

      {navigation.footerItems.length > 0 && (
        <>
          <Divider sx={{ my: 2 }} />
          <List dense disablePadding>
            {navigation.footerItems.map((item) => renderSidebarItem(item))}
          </List>
        </>
      )}
    </Box>
  );
}

export default function Sidebar() {
  const theme = useTheme();
  const isCompactViewport = useMediaQuery(theme.breakpoints.down('md'));
  const [prefersExpanded, setPrefersExpanded] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileToggleRef = useRef<HTMLButtonElement | null>(null);
  const mobileDrawerId = useId();
  const location = useLocation();
  const { session } = useAuth();

  const profile = session ? resolveProfile(session.perfil) : null;
  const navigation = getSidebarNavigation(profile);
  const roleLabel = session ? profileLabel(session.perfil) : 'Usuário';
  const expanded = isCompactViewport ? false : prefersExpanded;
  const showMobileDrawer = isCompactViewport && mobileOpen;
  const currentWidth = expanded ? drawerWidthExpanded : drawerWidthCollapsed;

  const allItems = useMemo(
    () => [
      ...navigation.topItems,
      ...navigation.sections.flatMap((section) => section.items),
      ...navigation.footerItems,
    ],
    [navigation],
  );

  const hasQuerySpecificMatch = useMemo(
    () => allItems.some((item) => {
      const result = matchesPathAndQuery(item.path, location.pathname, location.search);
      return result.matched && result.hasQuery;
    }),
    [allItems, location.pathname, location.search],
  );

  const toggleDesktopSidebar = () => {
    setPrefersExpanded((prev) => !prev);
  };

  const openMobileDrawer = useCallback(() => {
    setMobileOpen(true);
  }, []);

  const closeMobileDrawer = useCallback(() => {
    setMobileOpen(false);
  }, []);

  const restoreMobileFocus = useCallback(() => {
    const active = document.activeElement;
    if (!active || active === document.body) {
      mobileToggleRef.current?.focus();
    }
  }, []);

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
        <SidebarNavContent
          navigation={navigation}
          roleLabel={roleLabel}
          showLabels={expanded}
          isCompactViewport={isCompactViewport}
          showMobileDrawer={showMobileDrawer}
          mobileDrawerId={mobileDrawerId}
          mobileToggleRef={mobileToggleRef}
          pathname={location.pathname}
          search={location.search}
          hasQuerySpecificMatch={hasQuerySpecificMatch}
          onOpenMobile={openMobileDrawer}
          onCloseMobile={closeMobileDrawer}
        />
      </Drawer>

      {isCompactViewport && (
        <Drawer
          id={mobileDrawerId}
          variant="temporary"
          open={showMobileDrawer}
          onClose={closeMobileDrawer}
          ModalProps={{ keepMounted: false }}
          slotProps={{ transition: { onExited: restoreMobileFocus } }}
          sx={{
            '& .MuiDrawer-paper': {
              width: drawerWidthExpanded,
              maxWidth: '85vw',
              boxSizing: 'border-box',
              backgroundColor: '#fff',
              borderRight: '1px solid #e2e8f0',
              mt: '64px',
              height: 'calc(100vh - 64px)',
              overflowX: 'hidden',
              overflowY: 'auto',
            },
          }}
        >
          <SidebarNavContent
            navigation={navigation}
            roleLabel={roleLabel}
            showLabels
            isCompactViewport={isCompactViewport}
            showMobileDrawer={showMobileDrawer}
            mobileDrawerId={mobileDrawerId}
            mobileToggleRef={mobileToggleRef}
            pathname={location.pathname}
            search={location.search}
            hasQuerySpecificMatch={hasQuerySpecificMatch}
            onOpenMobile={openMobileDrawer}
            onCloseMobile={closeMobileDrawer}
            onNavigate={closeMobileDrawer}
          />
        </Drawer>
      )}

      {!isCompactViewport && (
        <Tooltip title={expanded ? 'Recolher menu' : 'Expandir menu'} {...tooltipProps}>
          <IconButton
            type="button"
            onClick={toggleDesktopSidebar}
            aria-label={expanded ? 'Recolher menu' : 'Expandir menu'}
            aria-expanded={expanded}
            sx={{
              position: 'absolute',
              top: 'calc(64px + 112px)',
              left: currentWidth - 22,
              zIndex: 1300,
              backgroundColor: '#ffffff',
              color: brandTextColor,
              border: '1px solid #cbd5e1',
              width: 44,
              height: 44,
              boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
              transition: 'left 0.2s ease-in-out',
              '&:hover': {
                backgroundColor: '#fff7ed',
                borderColor: brandTextColor,
              },
              '&.Mui-focusVisible, &:focus-visible': {
                outline: `3px solid ${brandTextColor}`,
                outlineOffset: 2,
              },
            }}
          >
            {expanded ? <ChevronLeftIcon fontSize="small" aria-hidden="true" /> : <ChevronRightIcon fontSize="small" aria-hidden="true" />}
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
}