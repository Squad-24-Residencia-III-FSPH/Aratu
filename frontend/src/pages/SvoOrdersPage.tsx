import { useAuth } from '../auth/useAuth'
import SvoOrderList from '../components/svo/SvoOrderList'

/** Consulta de leitura para central SVO e gestor, sem comandos de alteração e sem persistir conteúdo SVO. */
export default function SvoOrdersPage() {
  const { api, session } = useAuth()
  return session ? <SvoOrderList key={`${session.token}:${session.perfil}`} api={api} operational={false} /> : null
}
