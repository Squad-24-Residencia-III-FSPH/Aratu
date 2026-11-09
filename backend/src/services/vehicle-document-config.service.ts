/** Prazo padrão de alerta de vencimento de documentos de veículos (em dias corridos). */
export const DEFAULT_VEHICLE_DOCUMENT_ALERT_DAYS = 30

const MIN_ALERT_DAYS = 1
const MAX_ALERT_DAYS = 365

/**
 * Carrega e valida o prazo padrão de alerta de vencimento de documentos a partir das variáveis de ambiente.
 *
 * Aplica o padrão provisório de 30 dias quando `VEHICLE_DOCUMENT_ALERT_DAYS` não está definida,
 * permitindo ajuste operacional sem recompilação ou redeploy.
 *
 * @param environment - Mapa de variáveis de ambiente (tipicamente `process.env`).
 * @returns Quantidade de dias corridos para o alerta de vencimento (inteiro entre 1 e 365).
 * @throws {Error} Se o valor informado não for um inteiro entre 1 e 365.
 */
export function loadVehicleDocumentAlertDays(environment: Record<string, string | undefined>): number {
  const raw = environment.VEHICLE_DOCUMENT_ALERT_DAYS?.trim()
  if (!raw) return DEFAULT_VEHICLE_DOCUMENT_ALERT_DAYS

  if (!/^[1-9]\d*$/.test(raw)) {
    throw new Error('VEHICLE_DOCUMENT_ALERT_DAYS deve ser um inteiro entre 1 e 365.')
  }
  const days = Number(raw)
  if (!Number.isSafeInteger(days) || days < MIN_ALERT_DAYS || days > MAX_ALERT_DAYS) {
    throw new Error('VEHICLE_DOCUMENT_ALERT_DAYS deve ser um inteiro entre 1 e 365.')
  }
  return days
}
