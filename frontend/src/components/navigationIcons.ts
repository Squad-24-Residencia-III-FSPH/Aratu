import Home from '@mui/icons-material/Home'
import Assignment from '@mui/icons-material/Assignment'
import AssignmentTurnedIn from '@mui/icons-material/AssignmentTurnedIn'
import LocalShipping from '@mui/icons-material/LocalShipping'
import CheckCircle from '@mui/icons-material/CheckCircle'
import DirectionsCar from '@mui/icons-material/DirectionsCar'
import EventAvailable from '@mui/icons-material/EventAvailable'
import MedicalServices from '@mui/icons-material/MedicalServices'
import Person from '@mui/icons-material/Person'
import Build from '@mui/icons-material/Build'
import Category from '@mui/icons-material/Category'
import LocalGasStation from '@mui/icons-material/LocalGasStation'
import Description from '@mui/icons-material/Description'
import Visibility from '@mui/icons-material/Visibility'
import Warning from '@mui/icons-material/Warning'
import DashboardIcon from '@mui/icons-material/Dashboard'
import BarChart from '@mui/icons-material/BarChart'
import Security from '@mui/icons-material/Security'
import AdminPanelSettings from '@mui/icons-material/AdminPanelSettings'
import MenuIcon from '@mui/icons-material/Menu'
import AddIcon from '@mui/icons-material/Add'
import type { SvgIconComponent } from '@mui/icons-material'
import type { SidebarIconName } from './sidebarNavigation'

export const NAVIGATION_ICONS: Record<SidebarIconName, SvgIconComponent> = {
  home: Home,
  users: Person,
  permissions: AdminPanelSettings,
  audit: Security,
  requests: Assignment,
  newRequest: AddIcon,
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
  menu: MenuIcon,
  add: AddIcon,
}
