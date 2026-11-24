import { useAuth } from '../../auth/useAuth'
import SvoOrderList from '../../components/svo/SvoOrderList'

/** Consulta de leitura para central SVO, gestor e administrador, sem comandos de alteração. */
export default function SvoOrdersPage() {
  const { api, session } = useAuth()
  return session ? <SvoOrderList key={`${session.token}:${session.perfil}`} api={api} operational={false} /> : null
}
