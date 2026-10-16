import { useEffect } from 'react'
import { navigate } from './navigation'

export default function Redirect({ to }: { to: string }) {
  useEffect(() => { navigate(to, true) }, [to])
  return null
}
