import { Box, Button, Typography, useTheme } from '@mui/material'
import { Link as RouterLink, useLocation } from 'react-router-dom'
import type { Profile } from '../auth/profiles'
import { getSidebarNavigation } from './sidebarNavigation'
import { NAVIGATION_ICONS } from './navigationIcons'

const MenuIcon = NAVIGATION_ICONS.menu

interface MobileNavigationProps {
  profile: Profile | null
  permissions?: readonly string[]
  onMenuClick: () => void
}

/** Navegação móvel fixa no alcance do polegar e protegida pela safe area do aparelho. */
export default function MobileNavigation({ profile, permissions, onMenuClick }: MobileNavigationProps) {
  const theme = useTheme()
  const location = useLocation()
  const navigation = getSidebarNavigation(profile, permissions)

  return (
    <Box
      component="nav"
      className="mobileNavigation"
      aria-label="Navegação móvel"
      sx={{
        display: { xs: 'flex', sm: 'none' },
        position: 'fixed',
        insetInline: 0,
        bottom: 0,
        zIndex: theme.zIndex.appBar,
        alignItems: 'center',
        gap: 0.5,
        px: 'max(8px, env(safe-area-inset-left, 0px))',
        pr: 'max(8px, env(safe-area-inset-right, 0px))',
        pt: 0.5,
        pb: 'calc(8px + env(safe-area-inset-bottom, 0px))',
        minHeight: 'calc(68px + env(safe-area-inset-bottom, 0px))',
        borderTop: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        boxShadow: '0 -3px 16px rgba(17, 24, 39, 0.08)',
      }}
    >
      {navigation.mobileItems.slice(0, 3).map((item) => {
        const Icon = NAVIGATION_ICONS[item.icon]
        const selected = item.path === location.pathname
        return (
          <Button
            key={item.label}
            component={RouterLink}
            to={item.path ?? '/'}
            aria-current={selected ? 'page' : undefined}
            startIcon={<Icon aria-hidden="true" />}
            sx={{
              flex: '1 1 0',
              flexDirection: 'column',
              gap: 0.125,
              px: 0.25,
              py: 0.5,
              minWidth: 0,
              minHeight: 48,
              color: selected ? 'text.primary' : 'text.secondary',
              bgcolor: selected ? '#f1f5f9' : 'transparent',
              borderRadius: 2,
              '& .MuiButton-startIcon': {
                m: 0,
                color: selected ? 'text.primary' : 'text.secondary',
                '& svg': { fontSize: 20 },
              },
            }}
          >
            <Typography component="span" variant="caption" noWrap sx={{ maxWidth: '100%', fontSize: '0.68rem', lineHeight: 1.1 }}>
              {item.label}
            </Typography>
          </Button>
        )
      })}
      <Button
        type="button"
        onClick={onMenuClick}
        startIcon={<MenuIcon aria-hidden="true" />}
        sx={{
          flex: '1 1 0',
          flexDirection: 'column',
          gap: 0.125,
          px: 0.25,
          py: 0.5,
          minWidth: 0,
          minHeight: 48,
          color: 'text.secondary',
          '& .MuiButton-startIcon': { m: 0, '& svg': { fontSize: 20 } },
        }}
      >
        <Typography component="span" variant="caption" sx={{ fontSize: '0.68rem', lineHeight: 1.1 }}>
          Menu
        </Typography>
      </Button>
    </Box>
  )
}
