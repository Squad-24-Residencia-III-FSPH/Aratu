import type { FormSelectOption } from '../../components/ui/FormField'
import type { DriverFormErrors, DriverFormValues } from '../../drivers/driverForm'
import { DriverRequestError } from '../../drivers/driverTypes'
import type { EligibleDriverAccount } from '../../services/driversService'

const MASKED_CPF_PATTERN = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g
const RAW_CPF_PATTERN = /(?<!\d)\d{11}(?!\d)/g

/** Ordem visual dos campos para mover o foco até o primeiro item inválido. */
export const DRIVER_FORM_FOCUS_ORDER: readonly (keyof DriverFormValues)[] = [
  'name',
  'cpf',
  'cnhNumber',
  'cnhCategory',
  'cnhExpiresAt',
  'phone',
  'status',
  'userId',
  'reason',
]

/** Resultado do mapeamento de erro da API para os controles do formulário. */
export interface MappedDriverApiError {
  fieldErrors: DriverFormErrors
  bannerMessage: string
  shouldRefreshAccounts: boolean
  clearUserId: boolean
}

/** Remove qualquer CPF mascarado ou em dígitos de mensagens exibidas ou registradas. */
export function sanitizeCpfFromMessage(message: string): string {
  return message
    .replace(MASKED_CPF_PATTERN, '[CPF omitido]')
    .replace(RAW_CPF_PATTERN, '[CPF omitido]')
}

/** Identifica o primeiro campo inválido na ordem natural de leitura do formulário. */
export function firstInvalidDriverField(errors: DriverFormErrors): keyof DriverFormValues | null {
  return DRIVER_FORM_FOCUS_ORDER.find((field) => Boolean(errors[field])) ?? null
}

/**
 * Converte erros HTTP da API de motoristas em feedback associado ao campo correspondente.
 *
 * Evita ecoar CPF digitado e traduz orientações incompatíveis com a máscara automática.
 */
export function mapDriverApiError(error: unknown): MappedDriverApiError {
  const rawMessage = error instanceof DriverRequestError || error instanceof Error
    ? error.message
    : 'Não foi possível salvar o motorista. Tente novamente.'
  const safeMessage = sanitizeCpfFromMessage(rawMessage)
  const lower = safeMessage.toLocaleLowerCase('pt-BR')

  if (lower.includes('cpf')) {
    const isConflict = (error instanceof DriverRequestError && error.kind === 'conflict')
      || lower.includes('já cadastrado')
    return {
      fieldErrors: {
        cpf: isConflict ? 'CPF já cadastrado.' : 'CPF inválido. Confira os 11 dígitos informados.',
      },
      bannerMessage: '',
      shouldRefreshAccounts: false,
      clearUserId: false,
    }
  }

  if (lower.includes('conta') || lower.includes('perfil motorista') || lower.includes('vinculada')) {
    const isConflict = (error instanceof DriverRequestError && error.kind === 'conflict')
      || lower.includes('já está vinculada')
    return {
      fieldErrors: {
        userId: isConflict
          ? 'Esta conta já está vinculada a outro motorista. Escolha outra conta ou deixe sem vínculo.'
          : safeMessage,
      },
      bannerMessage: '',
      shouldRefreshAccounts: isConflict,
      clearUserId: isConflict,
    }
  }

  if (lower.includes('cnh vencida') || lower.includes('validade da cnh')) {
    return {
      fieldErrors: { cnhExpiresAt: safeMessage },
      bannerMessage: '',
      shouldRefreshAccounts: false,
      clearUserId: false,
    }
  }

  if (lower.includes('categoria da cnh')) {
    return {
      fieldErrors: { cnhCategory: safeMessage },
      bannerMessage: '',
      shouldRefreshAccounts: false,
      clearUserId: false,
    }
  }

  if (lower.includes('número da cnh')) {
    return {
      fieldErrors: { cnhNumber: safeMessage },
      bannerMessage: '',
      shouldRefreshAccounts: false,
      clearUserId: false,
    }
  }

  if (lower.includes('nome do motorista')) {
    return {
      fieldErrors: { name: safeMessage },
      bannerMessage: '',
      shouldRefreshAccounts: false,
      clearUserId: false,
    }
  }

  if (lower.includes('telefone')) {
    return {
      fieldErrors: { phone: safeMessage },
      bannerMessage: '',
      shouldRefreshAccounts: false,
      clearUserId: false,
    }
  }

  if (lower.includes('reason') || lower.includes('justificativa')) {
    return {
      fieldErrors: { reason: safeMessage },
      bannerMessage: '',
      shouldRefreshAccounts: false,
      clearUserId: false,
    }
  }

  return {
    fieldErrors: {},
    bannerMessage: safeMessage,
    shouldRefreshAccounts: false,
    clearUserId: false,
  }
}

/**
 * Formata as opções de contas `MOTORISTA` elegíveis devolvidas por `/drivers/eligible-accounts`,
 * preservando apenas o vínculo atualmente persistido em edição caso a conta tenha ficado inativa.
 */
export function buildEligibleAccountOptions(
  accounts: readonly EligibleDriverAccount[],
  editingDriverId?: string,
  persistedUserId?: string | null,
  selectedUserId?: string,
): FormSelectOption[] {
  const seen = new Set<string>()
  const options: FormSelectOption[] = []
  for (const account of accounts) {
    if (seen.has(account.id)) continue
    seen.add(account.id)
    options.push({
      value: account.id,
      label: account.email ? `${account.name} — ${account.email}` : account.name,
    })
  }

  if (
    selectedUserId
    && editingDriverId
    && persistedUserId === selectedUserId
    && !seen.has(selectedUserId)
  ) {
    options.unshift({
      value: selectedUserId,
      label: `Conta atualmente vinculada (ID ${selectedUserId})`,
    })
  }

  return options
}

/** Formata data/hora ISO no fuso operacional da FSPH (`America/Maceio`). */
export function formatDateTimePtBr(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Maceio',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed)
}
