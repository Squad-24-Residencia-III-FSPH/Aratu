import type { Driver, DriverStatus } from './driverTypes'

export const CNH_EXPIRY_WARNING_DAYS = 30

export interface DriverFormValues {
  name: string
  cpf: string
  cnhNumber: string
  cnhCategory: string
  cnhExpiresAt: string
  phone: string
  userId: string
  status: DriverStatus
  reason: string
}

export type DriverFormErrors = Partial<Record<keyof DriverFormValues, string>>

export const EMPTY_DRIVER_FORM: DriverFormValues = {
  name: '',
  cpf: '',
  cnhNumber: '',
  cnhCategory: '',
  cnhExpiresAt: '',
  phone: '',
  userId: '',
  status: 'ACTIVE',
  reason: '',
}

/** Aplica a máscara visual do CPF mantendo apenas os onze primeiros dígitos. */
export function maskCpf(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`
}

/** Data corrente no fuso usado pela regra de negócio da API de motoristas (America/Maceio). */
export function fsphToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Maceio' }).format(now)
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

export type CnhValidity = 'expired' | 'upcoming' | 'valid'

/** Reproduz a validade inclusiva da API e a janela confirmada de alerta de 30 dias. */
export function cnhValidity(cnhExpiresAt: string, today = fsphToday()): CnhValidity {
  if (cnhExpiresAt < today) return 'expired'
  if (cnhExpiresAt <= addDays(today, CNH_EXPIRY_WARNING_DAYS)) return 'upcoming'
  return 'valid'
}

/** Formata a data da API (somente data) sem deslocar o dia por fuso horário. */
export function formatIsoDate(value: string): string {
  const [year, month, day] = value.split('-')
  return `${day}/${month}/${year}`
}

/** Formata o CPF para exibição, mantendo o payload da API apenas com dígitos. */
export function cpfDigits(value: string): string {
  return value.replace(/\D/g, '')
}

export function validateDriverForm(values: DriverFormValues): DriverFormErrors {
  const errors: DriverFormErrors = {}
  if (!values.name.trim()) errors.name = 'Informe o nome do motorista.'
  if (cpfDigits(values.cpf).length !== 11) errors.cpf = 'Informe os 11 dígitos do CPF.'
  if (!values.cnhNumber.trim()) errors.cnhNumber = 'Informe o número da CNH.'
  if (!values.cnhCategory) errors.cnhCategory = 'Selecione a categoria da CNH.'
  if (!values.cnhExpiresAt) errors.cnhExpiresAt = 'Informe a validade da CNH.'
  if (!values.status) errors.status = 'Selecione a situação inicial.'
  if (!values.reason.trim()) errors.reason = 'Informe a justificativa da alteração.'
  return errors
}

export function driverToFormValues(driver: Driver): DriverFormValues {
  return {
    name: driver.name,
    cpf: maskCpf(driver.cpf),
    cnhNumber: driver.cnhNumber,
    cnhCategory: driver.cnhCategory,
    cnhExpiresAt: driver.cnhExpiresAt,
    phone: driver.phone ?? '',
    userId: driver.userId ?? '',
    status: driver.status,
    reason: '',
  }
}
