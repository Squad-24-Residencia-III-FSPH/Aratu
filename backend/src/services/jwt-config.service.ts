import type { JwtConfig } from '../types/auth'

const DEFAULT_EXPIRATION = '8h'
const UNIT_SECONDS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 60 * 60,
  d: 24 * 60 * 60,
}

export function loadJwtConfig(environment: Record<string, string | undefined>): JwtConfig {
  const secret = environment.JWT_SECRET?.trim()
  if (!secret) throw new Error('JWT_SECRET é obrigatória para iniciar a API.')

  const expiration = environment.JWT_EXPIRES_IN?.trim() || DEFAULT_EXPIRATION
  const match = /^([1-9]\d*)(s|m|h|d)$/i.exec(expiration)
  const amount = match?.[1]
  const unit = match?.[2]
  if (!amount || !unit) {
    throw new Error('JWT_EXPIRES_IN deve usar segundos, minutos, horas ou dias (ex.: 8h).')
  }

  const unitSeconds = UNIT_SECONDS[unit.toLowerCase()]
  if (!unitSeconds) {
    throw new Error('JWT_EXPIRES_IN deve usar segundos, minutos, horas ou dias (ex.: 8h).')
  }
  const expiresInSeconds = Number(amount) * unitSeconds
  if (!Number.isSafeInteger(expiresInSeconds)) {
    throw new Error('JWT_EXPIRES_IN excede o limite suportado.')
  }
  return { secret, expiresInSeconds }
}
