import { useCallback, useEffect, useRef, useState } from 'react'
import type { ApiRequest } from '../api/client'
import { useSessionDraft } from '../auth/sessionDrafts'
import { finishTrip, listMyTrips, startTrip } from '../services/tripsService'
import {
  confirmationMessage, formatDateTime, formatKm, NEXT_ACTION, operationalDay, parseKmInput, TRIP_STATUS_LABELS,
} from '../trips/tripPresentation'
import { isOutcomeUncertain, TripRequestError } from '../trips/tripTypes'
import type { DriverTrip, Trip, TripExecutionAction } from '../trips/tripTypes'

const CLOCK_TICK_MS = 60_000
const LIST_ERROR_FALLBACK = 'Não foi possível carregar suas viagens.'
const UNCERTAIN_GUIDANCE = 'Não foi possível confirmar se o registro foi concluído. Atualize a situação antes de tentar novamente.'
const MISSING_TRIP_MESSAGE = 'Esta viagem não está mais entre as pendentes. Isso pode indicar finalização, cancelamento ou mudança de vínculo; confirme com o gestor antes de continuar.'
const CHANGED_TRIP_MESSAGE = 'A situação desta viagem mudou desde que você abriu este formulário. Feche-o e escolha a ação disponível para a situação atual.'

/** Rascunho em memória do hodômetro, recuperável pelo mesmo motorista após a expiração. */
export interface ExecutionDraft {
  tripId: string
  action: TripExecutionAction
  kmText: string
  /** Erro associado ao campo de quilometragem (validação local ou 400/422 da API). */
  fieldError: string
  /** Falha que não pertence ao campo (conflito, acesso negado, resultado incerto). */
  submitError: string
  /** O POST pode ter sido executado sem que a resposta chegasse. */
  uncertain: boolean
  /** O servidor negou a ação; o envio fica bloqueado. */
  denied: boolean
  /** Aguarda uma consulta bem-sucedida da lista após conflito ou ausência antes de permitir novo envio. */
  reconciling: boolean
  /** Resultado da reconciliação após falha incerta de rede/5xx. */
  reconciledOutcome: 'PENDING' | 'PERSISTED' | null
  /** Mensagem de status após reconsulta bem-sucedida de um envio incerto. */
  reconciliationNotice: string
}

/** Resultado confirmado pelo servidor, anunciado ao usuário. */
export interface ExecutionResult {
  key: number
  action: TripExecutionAction
  message: string
}

const defaultClock = () => new Date()

/** Resultado de uma consulta, carimbado com a sequência que a iniciou para descartar respostas obsoletas. */
interface ListOutcome {
  sequence: number
  trips: DriverTrip[] | null
  error: unknown
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : LIST_ERROR_FALLBACK
}

/** Reflete na lista local apenas o que o servidor confirmou: início atualiza o card; término o retira. */
function applyConfirmed(trips: readonly DriverTrip[], confirmed: Trip, action: TripExecutionAction): DriverTrip[] {
  if (action === 'FINISH') return trips.filter((trip) => trip.id !== confirmed.id)
  return trips.map((trip) => trip.id === confirmed.id
    ? { ...trip, status: 'IN_PROGRESS', startKm: confirmed.startKm, startedAt: confirmed.startedAt }
    : trip)
}

/**
 * Estado da tela "Minhas viagens" do motorista: consulta, início/término e recuperação de falhas.
 *
 * - Descarta respostas de consultas iniciadas antes de uma mutação ou depois da desmontagem.
 * - Nunca anuncia sucesso sem resposta válida do POST; falhas de rede/5xx/resposta inválida
 *   ficam como resultado incerto, sem reenvio automático.
 * - Falha de atualização mantém os dados anteriores como possivelmente desatualizados
 *   (`stale`) e bloqueia novas ações até uma consulta bem-sucedida.
 * - A guarda síncrona `submittingRef` impede duplo toque antes mesmo de o React re-renderizar.
 *
 * @param api - Cliente autenticado (`useAuth().api`).
 * @param clock - Fonte de "agora"; injetável para testar a virada do dia.
 */
export function useMyTrips(api: ApiRequest, clock: () => Date = defaultClock) {
  const [trips, setTrips] = useState<DriverTrip[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState('')
  const [execution, setExecution, clearExecution] = useSessionDraft<ExecutionDraft | null>('trips:execution', null)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<ExecutionResult | null>(null)
  const [now, setNow] = useState(clock)
  const listSequence = useRef(0)
  const executionSequence = useRef(0)
  const resultKey = useRef(0)
  const submittingRef = useRef(false)
  const reconcilingRef = useRef(false)
  const uncertainRef = useRef(false)

  const fetchList = useCallback((): Promise<ListOutcome> => {
    const sequence = ++listSequence.current
    return listMyTrips(api).then(
      (next): ListOutcome => ({ sequence, trips: next, error: null }),
      (error: unknown): ListOutcome => ({ sequence, trips: null, error }),
    )
  }, [api])

  const settleList = useCallback((outcome: ListOutcome, failureMessage?: string) => {
    if (outcome.sequence !== listSequence.current) return
    if (outcome.trips) {
      const tripsSnapshot = outcome.trips
      reconcilingRef.current = false
      uncertainRef.current = false
      setTrips(tripsSnapshot)
      setListError('')
      setExecution((current) => {
        if (submittingRef.current || !current || (!current.reconciling && !current.uncertain)) return current
        if (current.uncertain) {
          const found = tripsSnapshot.find((candidate) => candidate.id === current.tripId) ?? null
          if (!found) {
            return {
              ...current,
              reconciling: false,
              uncertain: false,
              submitError: '',
              reconciledOutcome: null,
              reconciliationNotice: '',
            }
          }
          if (NEXT_ACTION[found.status] === current.action) {
            const startDetail = current.action === 'FINISH' && found.startKm !== null
              ? ` (km inicial registrado: ${formatKm(found.startKm)})`
              : ''
            return {
              ...current,
              reconciling: false,
              uncertain: false,
              submitError: '',
              reconciledOutcome: 'PENDING',
              reconciliationNotice: `Situação atualizada: a viagem #${found.id} continua ${TRIP_STATUS_LABELS[found.status].toLowerCase()}${startDetail}. Confira a quilometragem e confirme novamente se desejar tentar de novo.`,
            }
          }
          const startedWhen = found.startedAt ? ` em ${formatDateTime(found.startedAt)}` : ''
          const startedKm = found.startKm !== null ? ` com ${formatKm(found.startKm)}` : ''
          return {
            ...current,
            reconciling: false,
            uncertain: false,
            submitError: '',
            reconciledOutcome: 'PERSISTED',
            reconciliationNotice: `Situação atualizada: a viagem #${found.id} já consta no servidor como ${TRIP_STATUS_LABELS[found.status]}${startedWhen}${startedKm}.`,
          }
        }
        return { ...current, reconciling: false }
      })
    } else {
      setListError(failureMessage ?? errorMessage(outcome.error))
    }
    setLoading(false)
  }, [setExecution])

  const loadTrips = useCallback(
    (failureMessage?: string): Promise<void> => fetchList().then((outcome) => settleList(outcome, failureMessage)),
    [fetchList, settleList],
  )

  useEffect(() => {
    void fetchList().then((outcome) => settleList(outcome))
    return () => {
      listSequence.current += 1
      executionSequence.current += 1
    }
  }, [fetchList, settleList])

  useEffect(() => {
    function syncDay() {
      const current = clock()
      setNow((previous) => operationalDay(previous) === operationalDay(current) ? previous : current)
    }
    const timer = setInterval(syncDay, CLOCK_TICK_MS)
    window.addEventListener('focus', syncDay)
    document.addEventListener('visibilitychange', syncDay)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', syncDay)
      document.removeEventListener('visibilitychange', syncDay)
    }
  }, [clock])

  const refresh = useCallback(() => {
    setLoading(true)
    void loadTrips()
  }, [loadTrips])

  function openExecution(tripId: string, action: TripExecutionAction) {
    if (submittingRef.current) return
    reconcilingRef.current = false
    uncertainRef.current = false
    setResult(null)
    setExecution({
      tripId,
      action,
      kmText: '',
      fieldError: '',
      submitError: '',
      uncertain: false,
      denied: false,
      reconciling: false,
      reconciledOutcome: null,
      reconciliationNotice: '',
    })
  }

  function closeExecution() {
    if (submittingRef.current) return
    reconcilingRef.current = false
    uncertainRef.current = false
    clearExecution()
  }

  function changeKm(kmText: string) {
    setExecution((current) => current && { ...current, kmText, fieldError: '' })
  }

  function failExecution(error: unknown) {
    const kind = error instanceof TripRequestError ? error.kind : null
    const uncertain = kind === null || kind === 'session' || isOutcomeUncertain(error)
    const needsReconciliation = kind === 'conflict' || kind === 'notFound' || kind === 'forbidden'
    const message = error instanceof TripRequestError ? error.message : 'Ocorreu um erro inesperado.'
    if (needsReconciliation) reconcilingRef.current = true
    if (uncertain) uncertainRef.current = true
    setExecution((current) => current && {
      ...current,
      fieldError: kind === 'validation' ? message : '',
      submitError: kind === 'validation' ? '' : uncertain ? `${message} ${UNCERTAIN_GUIDANCE}` : message,
      uncertain,
      denied: kind === 'forbidden',
      reconciling: current.reconciling || needsReconciliation,
      reconciledOutcome: null,
      reconciliationNotice: '',
    })
    if (needsReconciliation) {
      setLoading(true)
      void loadTrips()
    }
  }

  const stale = trips !== null && listError !== ''
  const activeTrip = execution ? trips?.find((candidate) => candidate.id === execution.tripId) ?? null : null
  const executionIssue = !execution ? ''
    : trips === null ? listError
    : !activeTrip ? MISSING_TRIP_MESSAGE
      : NEXT_ACTION[activeTrip.status] !== execution.action ? CHANGED_TRIP_MESSAGE : ''
  const confirmBlocked = !execution
    || trips === null
    || Boolean(executionIssue)
    || execution.denied
    || execution.reconciling
    || execution.uncertain
    || stale

  async function submitExecution() {
    if (!execution || submittingRef.current || reconcilingRef.current || uncertainRef.current || confirmBlocked || !activeTrip) return
    const km = parseKmInput(execution.kmText)
    if (!km.ok) {
      setExecution({ ...execution, fieldError: km.error })
      return
    }
    submittingRef.current = true
    const sequence = ++executionSequence.current
    setSubmitting(true)
    setExecution({
      ...execution,
      fieldError: '',
      submitError: '',
      uncertain: true,
      reconciledOutcome: null,
      reconciliationNotice: '',
    })
    let confirmed: Trip
    try {
      confirmed = execution.action === 'START'
        ? await startTrip(api, activeTrip.id, km.value)
        : await finishTrip(api, activeTrip.id, km.value)
    } catch (error) {
      if (executionSequence.current !== sequence) return
      failExecution(error)
      submittingRef.current = false
      setSubmitting(false)
      return
    }
    if (executionSequence.current !== sequence) return
    submittingRef.current = false
    setSubmitting(false)
    // Consultas anteriores ao POST ficam obsoletas; o card passa a refletir o valor confirmado.
    listSequence.current += 1
    setTrips((current) => current && applyConfirmed(current, confirmed, execution.action))
    clearExecution()
    resultKey.current += 1
    setResult({ key: resultKey.current, action: execution.action, message: confirmationMessage(execution.action, confirmed) })
    setLoading(true)
    void loadTrips('O registro foi confirmado, mas não foi possível atualizar a lista. Os dados exibidos podem estar desatualizados.')
  }

  return {
    trips,
    now,
    loading,
    listError,
    stale,
    execution,
    activeTrip,
    executionIssue,
    confirmBlocked,
    submitting,
    result,
    refresh,
    openExecution,
    closeExecution,
    changeKm,
    submitExecution,
  }
}
