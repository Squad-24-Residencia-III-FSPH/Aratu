import bcrypt = require('bcrypt')
import { Buffer } from 'node:buffer'

const BCRYPT_SALT_ROUNDS = 12
const BCRYPT_MAX_PASSWORD_BYTES = 72

/** Gera um hash bcrypt para persistir sem armazenar a senha original. */
export async function hashPassword(password: string): Promise<string> {
  if (!password) throw new Error('A senha não pode estar vazia.')
  if (Buffer.byteLength(password, 'utf8') > BCRYPT_MAX_PASSWORD_BYTES) {
    throw new Error('A senha excede o limite suportado pelo bcrypt.')
  }
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS)
}

/** Compara uma senha recebida com o hash persistido sem revelar o valor armazenado. */
export async function comparePassword(password: string, passwordHash: string): Promise<boolean> {
  if (!password || !passwordHash || Buffer.byteLength(password, 'utf8') > BCRYPT_MAX_PASSWORD_BYTES) {
    return false
  }
  return bcrypt.compare(password, passwordHash)
}
