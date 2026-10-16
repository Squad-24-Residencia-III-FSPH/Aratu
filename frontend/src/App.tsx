import { useAuth } from './auth/useAuth'
import LoginPage from './pages/LoginPage'
import ProfileHome from './pages/ProfileHome'
import Redirect from './routing/Redirect'
import { usePathname } from './routing/navigation'
import { resolveRoute } from './routing/routeDecision'

function App() {
  const { session } = useAuth()
  const path = usePathname()
  const route = resolveRoute(session, path)
  if (route.kind === 'redirect') return <Redirect to={route.to} />
  if (route.kind === 'login') return <LoginPage />
  return <ProfileHome profile={route.profile} />
}

export default App
