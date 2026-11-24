const OPERATIONAL_TIME_ZONE = 'America/Maceio'
const CIVIL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const WALL_TIME_PATTERN = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d)$/

function partsAt(instant: number): Record<string, string> {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: OPERATIONAL_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  })
  return Object.fromEntries(formatter.formatToParts(instant).map(({ type, value }) => [type, value]))
}

function wallPartsAsUtc(parts: Record<string, string>): number {
  const result = new Date(0)
  result.setUTCFullYear(Number(parts.year), Number(parts.month) - 1, Number(parts.day))
  result.setUTCHours(Number(parts.hour), Number(parts.minute), Number(parts.second), 0)
  return result.getTime()
}

/** Converte um horário de parede em America/Maceio para o instante ISO equivalente. */
export function operationalDateTimeToIso(value: string): string {
  const match = WALL_TIME_PATTERN.exec(value)
  if (!match || !isOperationalCivilDate(match[1]!)) throw new Error('Informe uma data e hora válidas no fuso de Maceió.')
  const nominal = Date.parse(`${value}:00Z`)
  let instant = nominal
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const correction = nominal - wallPartsAsUtc(partsAt(instant))
    instant += correction
    if (correction === 0) break
  }
  return new Date(instant).toISOString()
}

/** Formata um instante ISO como valor `datetime-local` no fuso operacional de Maceió. */
export function operationalDateTimeInput(value: string): string {
  const parts = partsAt(new Date(value).getTime())
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}

/** Formata uma data civil ou um instante no fuso operacional da frota. */
export function formatOperationalDateTime(value: string, withTime = true): string {
  const date = new Date(value.length === 10 ? `${value}T12:00:00Z` : value)
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: OPERATIONAL_TIME_ZONE, dateStyle: 'short', ...(withTime ? { timeStyle: 'short' as const } : {}),
  }).format(date)
}

function isOperationalCivilDate(value: string): boolean {
  if (!CIVIL_DATE_PATTERN.test(value) || value.startsWith('0000')) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return parsed.toISOString().slice(0, 10) === value
}

function operationalBoundary(value: string): string {
  if (!isOperationalCivilDate(value)) throw new Error('Informe uma data civil válida.')
  const nominal = Date.parse(`${value}T00:00:00Z`)
  let instant = nominal
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const correction = nominal - wallPartsAsUtc(partsAt(instant))
    instant += correction
    if (correction === 0) break
  }
  return new Date(instant).toISOString()
}

/** Início de um dia civil no fuso operacional. */
export function operationalDayStart(value: string): string { return operationalBoundary(value) }

/** Início exclusivo do dia civil seguinte no fuso operacional. */
export function operationalDayEndExclusive(value: string): string {
  if (!isOperationalCivilDate(value)) throw new Error('Informe uma data civil válida.')
  const endDate = new Date(`${value}T00:00:00Z`)
  endDate.setUTCDate(endDate.getUTCDate() + 1)
  return operationalBoundary(endDate.toISOString().slice(0, 10))
}

/** Limites semiabertos para filtros de dias civis no fuso operacional. */
export function operationalDateRange(from: string, to: string): { from: string; to: string } {
  return { from: operationalDayStart(from), to: operationalDayEndExclusive(to) }
}
