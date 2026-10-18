import bcrypt = require('bcrypt')
import { Buffer } from 'node:buffer'

const BCRYPT_SALT_ROUNDS = 12
const BCRYPT_MAX_PASSWORD_BYTES = 72

/**
 * Gera um hash criptográfico seguro utilizando o algoritmo bcrypt (fator de custo 12).
 *
 * Valida o tamanho máximo de bytes para evitar truncamento silencioso da senha pelo bcrypt
 * e assegura que nenhuma senha em texto puro seja persistida no banco de dados.
 *
 * @param password - Senha em texto puro a ser criptografada.
 * @returns Hash criptográfico pronto para armazenamento em `usr_password_hash`.
 * @throws {Error} Se a senha estiver vazia ou exceder o limite de 72 bytes em UTF-8.
 */
export async function hashPassword(password: string): Promise<string> {
  if (!password) throw new Error('A senha não pode estar vazia.')
  if (Buffer.byteLength(password, 'utf8') > BCRYPT_MAX_PASSWORD_BYTES) {
    throw new Error('A senha excede o limite suportado pelo bcrypt.')
  }
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS)
}

/**
 * Compara uma senha em texto puro com o hash bcrypt persistido em tempo constante.
 *
 * Previne ataques de temporização e falha de forma segura caso a senha ou o hash estejam ausentes
 * ou excedam o limite máximo suportado de 72 bytes.
 *
 * @param password - Senha em texto puro fornecida na requisição de login.
 * @param passwordHash - Hash armazenado no banco (`usr_password_hash`).
 * @returns `true` se a senha conferir com o hash; caso contrário, `false`.
 */
export async function comparePassword(password: string, passwordHash: string): Promise<boolean> {
  if (!password || !passwordHash || Buffer.byteLength(password, 'utf8') > BCRYPT_MAX_PASSWORD_BYTES) {
    return false
  }
  return bcrypt.compare(password, passwordHash)
}
