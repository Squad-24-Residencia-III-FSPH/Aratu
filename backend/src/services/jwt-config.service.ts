import type { JwtConfig } from '../types/auth'

const DEFAULT_EXPIRATION = '8h'
const UNIT_SECONDS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 60 * 60,
  d: 24 * 60 * 60,
}

/**
 * Carrega e valida as configurações de emissão e expiração de tokens JWT a partir das variáveis de ambiente.
 *
 * Suporta sufixos temporais `s` (segundos), `m` (minutos), `h` (horas) ou `d` (dias).
 * Aplica um tempo de expiração padrão de 8 horas (`8h`) caso a variável `JWT_EXPIRES_IN` não seja definida.
 *
 * @param environment - Mapa de variáveis de ambiente (tipicamente `process.env`).
 * @returns Configuração validada contendo o segredo criptográfico e a expiração em segundos.
 * @throws {Error} Se a variável `JWT_SECRET` não for fornecida.
 * @throws {Error} Se o formato da variável `JWT_EXPIRES_IN` for inválido ou exceder limites seguros.
 */
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
