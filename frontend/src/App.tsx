import { useAuth } from './auth/useAuth'
import LoginPage from './pages/LoginPage'
import ProfileHome from './pages/ProfileHome'
import ScheduleTripPage from './pages/ScheduleTripPage'
import Redirect from './routing/Redirect'
import { usePathname } from './routing/navigation'
import { resolveRoute } from './routing/routeDecision'

function App() {
  const { session } = useAuth()
  const path = usePathname()
  const route = resolveRoute(session, path)

  if (route.kind === 'redirect') return <Redirect to={route.to} />
  if (route.kind === 'login') return <LoginPage />
  if (route.kind === 'schedule-trip' || route.kind === 'preview-schedule-trip') {
    return <ScheduleTripPage requestId={route.requestId} />
  }
  return <ProfileHome profile={route.profile} />
}

export default App
