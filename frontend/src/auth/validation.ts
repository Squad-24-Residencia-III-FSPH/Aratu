import type { LoginCredentials } from './types.ts'

export type LoginErrors = Partial<Record<keyof LoginCredentials, string>>

export function validateLogin({ email, senha }: LoginCredentials): LoginErrors {
  const errors: LoginErrors = {}
  if (!email.trim()) errors.email = 'Informe seu e-mail.'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    errors.email = 'Informe um e-mail válido.'
  }
  if (!senha.trim()) errors.senha = 'Informe sua senha.'
  return errors
}
