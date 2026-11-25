import { useCallback, useId, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import {
  Box,
  Drawer,
  IconButton,
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
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import Home from '@mui/icons-material/Home';
import MenuIcon from '@mui/icons-material/Menu';

import { useAuth } from '../auth/useAuth';
import { profileInitials, profileLabel, resolveProfile } from '../auth/profiles';
import { getSidebarNavigation } from './sidebarNavigation';
import type { SidebarMenuItem, SidebarNavigation } from './sidebarNavigation';
import { NAVIGATION_ICONS } from './navigationIcons';

const drawerWidthExpanded = 260;
const drawerWidthCollapsed = 72;
const brandTextColor = '#b94700';

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
  onAction?: (item: SidebarMenuItem) => void;
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
  onAction,
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
    const Icon = NAVIGATION_ICONS[item.icon] || Home;
    const match = item.path
      ? matchesPathAndQuery(item.path, pathname, search)
      : { matched: false, hasQuery: false };
    const isSelected = match.matched && (match.hasQuery || !hasQuerySpecificMatch);
    const itemStyle = isSelected ? selectedStyle : defaultStyle;

    const content = (
      <ListItemButton
        {...(item.behavior === 'link' && item.path ? { component: RouterLink, to: item.path } : {})}
        selected={isSelected}
        aria-current={isSelected ? 'page' : undefined}
        aria-label={!showLabels ? item.label : undefined}
        onClick={() => {
          if (item.behavior === 'action') onAction?.(item);
          onNavigate?.();
        }}
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
      <ListItem disablePadding key={`${item.label}:${item.path ?? item.action ?? 'item'}`} sx={{ mb: 0.5 }}>
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

interface SidebarProps {
  expanded?: boolean;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  onAction?: (item: SidebarMenuItem) => void;
}

export default function Sidebar({
  expanded: desktopExpanded,
  mobileOpen: controlledMobileOpen,
  onMobileClose,
  onAction,
}: SidebarProps = {}) {
  const theme = useTheme();
  const isControlled = controlledMobileOpen !== undefined;
  const compactBySm = useMediaQuery(theme.breakpoints.down('sm'));
  const compactByMd = useMediaQuery(theme.breakpoints.down('md'));
  const isCompactViewport = isControlled ? compactBySm : compactByMd;

  const [prefersExpanded, setPrefersExpanded] = useState(true);
  const [internalMobileOpen, setInternalMobileOpen] = useState(false);
  const mobileToggleRef = useRef<HTMLButtonElement | null>(null);
  const mobileDrawerId = useId();
  const location = useLocation();
  const { session } = useAuth();

  const profile = session ? resolveProfile(session.perfil) : null;
  const navigation = getSidebarNavigation(profile);
  const roleLabel = session ? profileLabel(session.perfil) : 'Usuário';

  const resolvedDesktopExpanded = desktopExpanded ?? prefersExpanded;
  const showMobileDrawer = isCompactViewport && (controlledMobileOpen ?? internalMobileOpen);
  const expanded = isControlled
    ? (isCompactViewport ? Boolean(controlledMobileOpen) : resolvedDesktopExpanded)
    : (isCompactViewport ? false : resolvedDesktopExpanded);

  const currentWidth = expanded ? drawerWidthExpanded : drawerWidthCollapsed;
  const drawerWidth = isCompactViewport ? drawerWidthExpanded : currentWidth;

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
      if (!item.path) return false;
      const result = matchesPathAndQuery(item.path, location.pathname, location.search);
      return result.matched && result.hasQuery;
    }),
    [allItems, location.pathname, location.search],
  );

  const toggleDesktopSidebar = () => {
    setPrefersExpanded((prev) => !prev);
  };

  const openMobileDrawer = useCallback(() => {
    setInternalMobileOpen(true);
  }, []);

  const closeMobileDrawer = useCallback(() => {
    if (onMobileClose) {
      onMobileClose();
    } else {
      setInternalMobileOpen(false);
    }
  }, [onMobileClose]);

  const restoreMobileFocus = useCallback(() => {
    const active = document.activeElement;
    if (!active || active === document.body) {
      mobileToggleRef.current?.focus();
    }
  }, []);

  if (isControlled) {
    return (
      <Box sx={{ display: 'flex', position: 'relative', flexShrink: 0, width: isCompactViewport ? 0 : currentWidth }}>
        <Drawer
          variant={isCompactViewport ? 'temporary' : 'permanent'}
          open={!isCompactViewport || Boolean(controlledMobileOpen)}
          onClose={closeMobileDrawer}
          ModalProps={isCompactViewport ? { keepMounted: false } : undefined}
          slotProps={{
            paper: { id: 'primary-navigation', 'aria-label': 'Navegação principal' },
          }}
          sx={{
            width: isCompactViewport ? 0 : currentWidth,
            flexShrink: 0,
            transition: 'width 0.2s ease-in-out',
            '& .MuiDrawer-paper': {
              width: drawerWidth,
              maxWidth: isCompactViewport ? '85vw' : undefined,
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
            onNavigate={isCompactViewport ? closeMobileDrawer : undefined}
            onAction={onAction}
          />
        </Drawer>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', position: 'relative', flexShrink: 0, width: currentWidth }}>
      <Drawer
        variant="permanent"
        slotProps={{
          paper: { id: 'primary-navigation', 'aria-label': 'Navegação principal' },
        }}
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
          onAction={onAction}
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
              '@supports (height: 100dvh)': { height: 'calc(100dvh - 64px)' },
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
            onAction={onAction}
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
