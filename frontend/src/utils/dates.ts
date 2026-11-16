/** Fuso em que a FSPH opera; define o "dia" e o horário exibidos independentemente do aparelho. */
export const OPERATIONAL_TIME_ZONE = 'America/Maceio'

const DATE_TIME_FORMAT = new Intl.DateTimeFormat('pt-BR', {
  timeZone: OPERATIONAL_TIME_ZONE,
  dateStyle: 'short',
  timeStyle: 'short',
})

/**
 * Converte uma data de calendário (`AAAA-MM-DD`) para `DD/MM/AAAA`.
 *
 * Não usa `Date` de propósito: o valor representa um dia civil escolhido pela
 * pessoa, sem instante nem fuso, e converter para `Date` deslocaria o dia.
 */
export function formatCalendarDate(value: string): string {
  const [year, month, day] = value.split('-')
  return year && month && day ? `${day}/${month}/${year}` : value
}

/** Data e hora de um instante em pt-BR no fuso operacional, o mesmo usado no recorte "hoje". */
export function formatDateTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : DATE_TIME_FORMAT.format(date)
}
