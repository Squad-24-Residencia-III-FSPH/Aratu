/** Restringe a origem pública quando configurada e preserva o proxy local existente. */
export function loadCorsOrigin(env: NodeJS.ProcessEnv): string | undefined {
  const value = env.CORS_ALLOWED_ORIGIN?.trim()
  if (!value) return undefined
  try {
    const url = new URL(value)
    if (!['https:', 'http:'].includes(url.protocol) || url.origin !== value || url.username || url.password) {
      throw new Error('invalid')
    }
    return url.origin
  } catch {
    throw new Error('CORS_ALLOWED_ORIGIN deve ser uma origem HTTP(S) sem caminho ou barra final.')
  }
}
