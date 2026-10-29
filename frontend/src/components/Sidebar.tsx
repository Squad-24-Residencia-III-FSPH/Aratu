import { Box, Divider, Drawer, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Typography } from '@mui/material'
import AdminPanelSettings from '@mui/icons-material/AdminPanelSettings'
import Assignment from '@mui/icons-material/Assignment'
import BarChart from '@mui/icons-material/BarChart'
import Build from '@mui/icons-material/Build'
import CheckCircle from '@mui/icons-material/CheckCircle'
import DashboardIcon from '@mui/icons-material/Dashboard'
import Description from '@mui/icons-material/Description'
import DirectionsCar from '@mui/icons-material/DirectionsCar'
import Help from '@mui/icons-material/Help'
import Home from '@mui/icons-material/Home'
import LocalShipping from '@mui/icons-material/LocalShipping'
import LocalGasStation from '@mui/icons-material/LocalGasStation'
import Person from '@mui/icons-material/Person'
import Security from '@mui/icons-material/Security'
import Warning from '@mui/icons-material/Warning'
import type { SvgIconComponent } from '@mui/icons-material'
import { Link as RouterLink, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { profileLabel, resolveProfile } from '../auth/profiles'
import { getSidebarNavigation } from './sidebarNavigation'
import type { SidebarIconName, SidebarMenuItem } from './sidebarNavigation'

const drawerWidth = 260

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
}

function SidebarItem({ item, pathname }: { item: SidebarMenuItem; pathname: string }) {
  const Icon = icons[item.icon]
  const isSelectedHome = item.selected && item.icon === 'home'
  const icon = <ListItemIcon sx={{ minWidth: 36, ...(isSelectedHome ? { color: '#FF6B00' } : {}) }}><Icon fontSize="small" /></ListItemIcon>

  if (item.behavior === 'static') {
    return (
      <ListItem disablePadding key={item.label}>
        <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', minHeight: 48, px: 2 }}>
          {icon}
          <ListItemText primary={item.label} />
        </Box>
      </ListItem>
    )
  }

  const buttonStyles = {
    borderRadius: 1,
    '&:hover': { backgroundColor: '#df68061e' },
    ...(item.selected ? {
      backgroundColor: 'rgba(255, 107, 0, 0.08) !important',
      color: '#111827',
      '&:hover': { backgroundColor: 'rgba(255, 107, 0, 0.12)' },
    } : {}),
  }

  if (item.behavior === 'link' && item.path) {
    return (
      <ListItem disablePadding key={item.label}>
        <ListItemButton
          component={RouterLink}
          to={item.path}
          selected={pathname === item.path}
          sx={buttonStyles}
        >
          {icon}
          <ListItemText primary={item.label} />
        </ListItemButton>
      </ListItem>
    )
  }

  return (
    <ListItem disablePadding key={item.label} sx={isSelectedHome ? { mb: 0.5 } : undefined}>
      <ListItemButton selected={item.selected} sx={buttonStyles}>
        {icon}
        <ListItemText
          primary={item.selected && item.icon === 'home'
            ? <Typography component="span" sx={{ fontSize: '0.875rem', fontWeight: 600 }}>{item.label}</Typography>
            : item.label}
        />
      </ListItemButton>
    </ListItem>
  )
}

export default function Sidebar() {
  const { session } = useAuth()
  const { pathname } = useLocation()
  const profile = session ? resolveProfile(session.perfil) : null
  const navigation = getSidebarNavigation(profile)

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: drawerWidth,
        flexShrink: 0,
        [`& .MuiDrawer-paper`]: { width: drawerWidth, boxSizing: 'border-box', backgroundColor: '#fff', borderRight: '1px solid #e2e8f0', mt: '64px' },
      }}
    >
      <Box sx={{ overflow: 'auto', p: 2 }}>
        <Typography variant="caption" sx={{ color: '#FF6B00', fontWeight: 700, px: 1, display: 'block', mb: 1 }}>
          {session ? profileLabel(session.perfil) : 'Aratu'}
        </Typography>

        <List disablePadding>
          {navigation.topItems.map((item) => <SidebarItem key={item.label} item={item} pathname={pathname} />)}
        </List>

        {navigation.showDividerAfterTop && <Divider sx={{ my: 2 }} />}

        {navigation.sections.map((section) => (
          <Box key={section.label}>
            <Typography variant="caption" sx={{ color: '#FF6B00', fontWeight: 700, px: 2, mt: section.spaced ? 2 : 0, display: 'block', fontSize: '0.7rem' }}>
              {section.label}
            </Typography>
            <List dense>
              {section.items.map((item) => <SidebarItem key={item.label} item={item} pathname={pathname} />)}
            </List>
          </Box>
        ))}

        <Divider sx={{ my: 2 }} />
        <List dense>
          {navigation.footerItems.map((item) => <SidebarItem key={item.label} item={item} pathname={pathname} />)}
        </List>
      </Box>
    </Drawer>
  )
}
