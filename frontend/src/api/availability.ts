import { SERVICE_UNAVAILABLE } from '../auth/loginService.ts'

interface AvailabilityOptions {
  signal?: AbortSignal
  fetcher?: typeof fetch
  timeoutMs?: number
  intervalMs?: number
}

/** Aguarda a retomada da API com GET, sem reenviar login ou operações de escrita. */
export async function waitForApi(baseUrl: string, {
  signal, fetcher = fetch, timeoutMs = 120_000, intervalMs = 3_000,
}: AvailabilityOptions = {}): Promise<void> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal
  try {
    while (!combined.aborted) {
      try {
        const response = await fetcher(baseUrl.replace(/\/+$/, '') + '/health/ready', {
          signal: combined, cache: 'no-store', headers: { Accept: 'application/json' },
        })
        if (response.ok && (await response.json()).status === 'ready' && !combined.aborted) return
      } catch { /* Somente a sondagem de leitura pode ser repetida durante a retomada. */ }
      if (combined.aborted) break
      await new Promise<void>(resolve => {
        const finish = (): void => { clearTimeout(timer); combined.removeEventListener('abort', finish); resolve() }
        const timer = setTimeout(finish, intervalMs)
        combined.addEventListener('abort', finish, { once: true })
        if (combined.aborted) finish()
      })
    }
    throw new Error(signal?.aborted ? 'A espera foi cancelada. Você pode tentar novamente.' : SERVICE_UNAVAILABLE)
  } finally {
    clearTimeout(timeout)
  }
}
