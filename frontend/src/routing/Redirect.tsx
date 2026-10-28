import { useEffect } from 'react'
import { navigate } from './navigation'

export default function Redirect({ to }: { to: string }) {
  useEffect(() => {
    if (to === '/login' && typeof window !== 'undefined' && window.location.pathname !== '/login') {
      try {
        sessionStorage.setItem('aratu_return_url', window.location.pathname)
      } catch {
        /* storage indisponível */
      }
    }
    navigate(to, true)
  }, [to])

  return null
}
