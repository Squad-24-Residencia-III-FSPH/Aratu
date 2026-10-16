import { useSyncExternalStore } from 'react'

export function navigate(path: string, replace = false) {
  if (window.location.pathname === path) return
  if (replace) window.history.replaceState(null, '', path)
  else window.history.pushState(null, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

function subscribe(onChange: () => void) {
  window.addEventListener('popstate', onChange)
  return () => window.removeEventListener('popstate', onChange)
}

export function usePathname() {
  return useSyncExternalStore(subscribe, () => window.location.pathname)
}
