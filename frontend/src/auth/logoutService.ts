const LOGOUT_TIMEOUT_MS = 15_000

interface LogoutOptions {
  baseUrl?: string
  timeoutMs?: number
  fetcher?: typeof fetch
}

/** Tenta auditar a saída usando o token capturado antes da limpeza local. */
export async function logout(
  token: string,
  { baseUrl = '/api', timeoutMs = LOGOUT_TIMEOUT_MS, fetcher = fetch }: LogoutOptions = {},
): Promise<boolean> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetcher(baseUrl.replace(/\/+$/, '') + '/auth/logout', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    })
    return !controller.signal.aborted && response.status === 200
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}
