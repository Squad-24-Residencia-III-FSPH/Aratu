import { useAuth } from '../auth/useAuth'
import SvoOrderList from '../components/svo/SvoOrderList'

/** Home da equipe, isolada por sessão para apagar dados e comandos após troca de conta. */
export default function SvoTeamOrdersPage() {
  const { api, session } = useAuth()
  return session ? <SvoOrderList key={`${session.token}:${session.perfil}`} api={api} operational /> : null
}
