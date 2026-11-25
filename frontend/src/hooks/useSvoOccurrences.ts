import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ApiRequest } from '../api/client.ts'
import {
  confirmSvoOccurrence,
  createSvoOccurrence,
  createSvoOrderDispatch,
  getSvoOccurrence,
  listSvoDispatchCandidates,
  listSvoDispatchOrders,
  listSvoOccurrences,
  retrySvoDispatch,
} from '../services/svoOccurrencesService.ts'
import {
  buildMaceioReceivedAtIso,
  isAwaitingSvoDispatch,
  isCanonicalBigIntId,
  isValidCivilDate,
  SVO_DISPATCH_ORDER_STATUS_LABELS,
  SvoOccurrenceRequestError,
} from '../types/svoOccurrence.ts'
import type {
  CreateSvoOccurrenceInput,
  SvoDispatchCandidateTeam,
  SvoDispatchCandidateVehicle,
  SvoDispatchOrderRef,
  SvoOccurrenceConfirmationResult,
  SvoOccurrenceCreationResult,
  SvoOccurrenceDetail,
  SvoOccurrenceErrorKind,
  SvoOccurrenceFilters,
  SvoOccurrenceListFilters,
  SvoOccurrenceStatus,
  SvoOccurrenceSummary,
  SvoRequesterType,
} from '../types/svoOccurrence.ts'

/** Valores de rascunho para o formulário de filtros da listagem SVO. */
export interface SvoOccurrenceFilterValues {
  status: SvoOccurrenceStatus | ''
  from: string
  to: string
}

/** Erros de validação dos campos do filtro de período. */
export interface SvoOccurrenceFilterErrors {
  from?: string
  to?: string
}

/** Campos editáveis do formulário de registro de solicitação SVO. */
export type CreateOccurrenceField =
  | 'requesterName'
  | 'requesterPhone'
  | 'requesterType'
  | 'location'
  | 'description'
  | 'evidenceDescription'
  | 'notes'
  | 'receivedDate'
  | 'receivedTime'

/** Rascunho em memória do diálogo de nova solicitação SVO. */
export interface CreateOccurrenceDraft {
  requesterName: string
  requesterPhone: string
  requesterType: SvoRequesterType | ''
  location: string
  description: string
  evidenceDescription: string
  notes: string
  receivedDate: string
  receivedTime: string
  fieldErrors: Partial<Record<CreateOccurrenceField, string>>
  error: string
  uncertain: boolean
}

/** Estado do detalhe sob demanda de uma solicitação SVO. */
export interface OccurrenceDetailState {
  id: string
  data: SvoOccurrenceDetail | null
  loading: boolean
  error: string
}

/** Estado do diálogo de confirmação de triagem SVO. */
export interface ConfirmOccurrenceState {
  id: string
  detail: SvoOccurrenceDetail | null
  loadingDetail: boolean
  detailError: string
  error: string
  blocked: boolean
  uncertain: boolean
}

/** Campos editáveis do formulário de geração de ordem SVO (FROTA-116). */
export type DispatchOrderField = 'teamId' | 'vehicleId'

/** Estado do diálogo de despacho / geração de ordem SVO (FROTA-116). */
export interface DispatchOrderDraft {
  occurrence: SvoOccurrenceSummary
  teamId: string
  vehicleId: string
  candidatesLoading: boolean
  candidatesError: string
  teams: SvoDispatchCandidateTeam[]
  vehicles: SvoDispatchCandidateVehicle[]
  fieldErrors: Partial<Record<DispatchOrderField, string>>
  error: string
  blocked: boolean
  uncertain: boolean
}

const EMPTY_FILTER_VALUES: SvoOccurrenceFilterValues = { status: '', from: '', to: '' }

function createEmptyDraft(): CreateOccurrenceDraft {
  return {
    requesterName: '',
    requesterPhone: '',
    requesterType: '',
    location: '',
    description: '',
    evidenceDescription: '',
    notes: '',
    receivedDate: '',
    receivedTime: '',
    fieldErrors: {},
    error: '',
    uncertain: false,
  }
}

function errorMessage(error: unknown, fallback = 'Não foi possível concluir a operação. Tente novamente.'): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback
}

function isUncertainError(error: unknown): boolean {
  return error instanceof SvoOccurrenceRequestError
    && (error.kind === 'network' || error.kind === 'server' || error.kind === 'invalidResponse')
}

function validateFilterValues(values: SvoOccurrenceFilterValues): SvoOccurrenceFilterErrors {
  const errors: SvoOccurrenceFilterErrors = {}
  if (values.from && !isValidCivilDate(values.from)) {
    errors.from = 'Informe uma data inicial válida no formato AAAA-MM-DD.'
  }
  if (values.to && !isValidCivilDate(values.to)) {
    errors.to = 'Informe uma data final válida no formato AAAA-MM-DD.'
  }
  if (!errors.from && !errors.to && values.from && values.to && values.from > values.to) {
    errors.from = 'A data inicial não pode ser posterior à data final.'
  }
  return errors
}

function toListFilters(values: SvoOccurrenceFilterValues): SvoOccurrenceListFilters {
  return {
    ...(values.status ? { status: values.status } : {}),
    ...(values.from ? { from: values.from } : {}),
    ...(values.to ? { to: values.to } : {}),
  }
}

function validateCreateDraft(draft: CreateOccurrenceDraft): Partial<Record<CreateOccurrenceField, string>> {
  const errors: Partial<Record<CreateOccurrenceField, string>> = {}
  if (!draft.requesterName.trim()) errors.requesterName = 'Informe o nome do solicitante.'
  if (!draft.requesterPhone.trim()) errors.requesterPhone = 'Informe o telefone do solicitante.'
  if (!draft.requesterType) errors.requesterType = 'Selecione o tipo do solicitante.'
  if (!draft.location.trim()) errors.location = 'Informe o local da solicitação.'
  if (!draft.description.trim()) errors.description = 'Informe a descrição da solicitação.'
  if (!draft.evidenceDescription.trim()) {
    errors.evidenceDescription = 'Descreva o canal ou meio de recebimento da solicitação.'
  }

  const hasDate = Boolean(draft.receivedDate.trim())
  const hasTime = Boolean(draft.receivedTime.trim())
  if (hasDate !== hasTime) {
    if (!hasDate) errors.receivedDate = 'Informe também a data do recebimento ou deixe ambos vazios.'
    if (!hasTime) errors.receivedTime = 'Informe também o horário do recebimento ou deixe ambos vazios.'
  } else if (hasDate && hasTime) {
    const iso = buildMaceioReceivedAtIso(draft.receivedDate.trim(), draft.receivedTime.trim())
    if (!iso) {
      errors.receivedDate = 'Informe uma data e hora de recebimento válidas (horário de Maceió).'
    } else if (Date.parse(iso) > Date.now()) {
      errors.receivedDate = 'A data e hora de recebimento não podem estar no futuro.'
    }
  }
  return errors
}

function formatDispatchSuffix(dispatch: SvoOccurrenceConfirmationResult['dispatch']): string {
  if (!dispatch) return ''
  if (dispatch.status === 'DISPATCHED') {
    return ` Ordem #${dispatch.orderId} encaminhada automaticamente para a equipe e viatura selecionadas.`
  }
  return ` A solicitação aguarda despacho: ${dispatch.reason === 'NO_TEAM' ? 'não há equipe elegível no plantão.' : 'não há viatura elegível com vaga.'}`
}

/**
 * Gerencia estado, filtros, confirmação de triagem, despacho automático, reavaliação e
 * geração manual de ordens na Central SVO.
 *
 * Mantém dados em memória, descarta respostas obsoletas em trocas de filtro/sessão e protege
 * mutações contra reenvio cego quando o resultado de rede/servidor é incerto.
 */
export function useSvoOccurrences(
  api: ApiRequest,
  enabledOrInitialStatus: boolean | SvoOccurrenceFilters['status'] = true,
) {
  const enabled = typeof enabledOrInitialStatus === 'boolean' ? enabledOrInitialStatus : true
  const initialStatus = typeof enabledOrInitialStatus === 'string' ? enabledOrInitialStatus : ''

  const [filterDraft, setFilterDraft] = useState<SvoOccurrenceFilterValues>(() => ({
    ...EMPTY_FILTER_VALUES,
    status: initialStatus,
  }))
  const [appliedFilters, setAppliedFilters] = useState<SvoOccurrenceFilterValues>(() => ({
    ...EMPTY_FILTER_VALUES,
    status: initialStatus,
  }))
  const [filterErrors, setFilterErrors] = useState<SvoOccurrenceFilterErrors>({})
  const [occurrences, setOccurrences] = useState<SvoOccurrenceSummary[] | null>(null)
  const [orders, setOrders] = useState<SvoDispatchOrderRef[]>([])
  const [ordersSyncWarning, setOrdersSyncWarning] = useState('')
  const [loading, setLoading] = useState(enabled)
  const [listError, setListError] = useState('')
  const [listErrorKind, setListErrorKind] = useState<SvoOccurrenceErrorKind | null>(null)
  const [partialWarning, setPartialWarning] = useState('')
  const [stale, setStale] = useState(false)
  const [forbidden, setForbidden] = useState(false)
  const [result, setResult] = useState('')

  const [detail, setDetail] = useState<OccurrenceDetailState | null>(null)
  const [createDraft, setCreateDraft] = useState<CreateOccurrenceDraft | null>(null)
  const [confirmState, setConfirmState] = useState<ConfirmOccurrenceState | null>(null)
  const [dispatchDraft, setDispatchDraft] = useState<DispatchOrderDraft | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [reconciling, setReconciling] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [confirmationError, setConfirmationError] = useState('')
  const [confirmationBlocked, setConfirmationBlocked] = useState(false)
  const [dispatchingId, setDispatchingId] = useState<string | null>(null)
  const [dispatchError, setDispatchError] = useState('')

  const listSequence = useRef(0)
  const detailSequence = useRef(0)
  const confirmSequence = useRef(0)
  const dispatchSequence = useRef(0)
  const lifecycle = useRef(0)
  const sending = useRef(false)
  const checking = useRef(false)

  const ordersByOccurrenceId = useMemo(() => {
    const map = new Map<string, SvoDispatchOrderRef>()
    for (const order of orders) {
      map.set(order.occurrenceId, order)
    }
    return map
  }, [orders])

  const reload = useCallback(async (partialMessage?: string): Promise<boolean> => {
    if (!enabled) {
      setLoading(false)
      return false
    }
    const sequence = ++listSequence.current
    setLoading(true)
    setListError('')
    try {
      const [loadedOccurrences, ordersOutcome] = await Promise.all([
        listSvoOccurrences(api, toListFilters(appliedFilters)),
        listSvoDispatchOrders(api)
          .then((data) => ({ ok: true as const, data }))
          .catch((error: unknown) => ({ ok: false as const, error })),
      ])
      if (sequence !== listSequence.current) return false
      setOccurrences(loadedOccurrences)
      setListError('')
      setListErrorKind(null)
      setPartialWarning('')
      setStale(false)
      setForbidden(false)
      if (ordersOutcome.ok) {
        setOrders(ordersOutcome.data)
        setOrdersSyncWarning('')
      } else {
        setOrdersSyncWarning(
          `Não foi possível atualizar o vínculo com ordens existentes (${errorMessage(ordersOutcome.error, 'falha na consulta de ordens')}).`,
        )
      }
      return true
    } catch (error) {
      if (sequence !== listSequence.current) return false
      const kind = error instanceof SvoOccurrenceRequestError ? error.kind : 'network'
      setListErrorKind(kind)
      if (kind === 'forbidden') {
        setForbidden(true)
        setListError(errorMessage(error, 'Seu perfil não tem permissão para consultar solicitações SVO.'))
        setLoading(false)
        return false
      }
      setListError(partialMessage ?? errorMessage(error, 'Não foi possível carregar as solicitações SVO.'))
      if (partialMessage) setPartialWarning(partialMessage)
      setStale(true)
      return false
    } finally {
      if (sequence === listSequence.current) setLoading(false)
    }
  }, [api, appliedFilters, enabled])

  useEffect(() => {
    const currentLifecycle = lifecycle.current
    void reload()
    return () => {
      lifecycle.current = currentLifecycle + 1
      listSequence.current += 1
      detailSequence.current += 1
      confirmSequence.current += 1
      dispatchSequence.current += 1
    }
  }, [reload])

  function updateFilterDraft(patch: Partial<SvoOccurrenceFilterValues>): void {
    setFilterDraft((current) => ({ ...current, ...patch }))
    setFilterErrors((current) => ({
      from: 'from' in patch || 'to' in patch ? undefined : current.from,
      to: 'to' in patch || 'from' in patch ? undefined : current.to,
    }))
  }

  function applyFilters(): SvoOccurrenceFilterErrors {
    if (sending.current || checking.current) return {}
    const errors = validateFilterValues(filterDraft)
    setFilterErrors(errors)
    if (errors.from || errors.to) return errors
    setResult('')
    setDetail(null)
    setAppliedFilters({ ...filterDraft })
    return {}
  }

  function clearFilters(): void {
    if (sending.current || checking.current) return
    setFilterDraft(EMPTY_FILTER_VALUES)
    setFilterErrors({})
    setResult('')
    setDetail(null)
    setAppliedFilters(EMPTY_FILTER_VALUES)
  }

  const changeFilters = useCallback((next: SvoOccurrenceFilters): void => {
    if (sending.current || checking.current) return
    setFilterDraft(next)
    setFilterErrors({})
    setAppliedFilters(next)
    setOccurrences(null)
    setListError('')
    setListErrorKind(null)
    setPartialWarning('')
    setDetail(null)
    detailSequence.current += 1
  }, [])

  const openDetail = useCallback(async (id: string): Promise<void> => {
    const sequence = ++detailSequence.current
    setDetail({ id, data: null, loading: true, error: '' })
    try {
      const data = await getSvoOccurrence(api, id)
      if (sequence === detailSequence.current) {
        setDetail({ id, data, loading: false, error: '' })
      }
    } catch (error) {
      if (sequence === detailSequence.current) {
        if (error instanceof SvoOccurrenceRequestError && error.kind === 'forbidden') {
          setForbidden(true)
        }
        setDetail({
          id,
          data: null,
          loading: false,
          error: errorMessage(error, 'Não foi possível consultar os detalhes da solicitação.'),
        })
      }
    }
  }, [api])

  const closeDetail = useCallback((): void => {
    detailSequence.current += 1
    setDetail(null)
  }, [])

  function openCreate(): void {
    if (sending.current || checking.current) return
    setResult('')
    setCreateDraft(createEmptyDraft())
  }

  function closeCreate(): void {
    if (!sending.current && !checking.current) {
      setCreateDraft(null)
    }
  }

  function updateCreateDraft(patch: Partial<Omit<CreateOccurrenceDraft, 'fieldErrors' | 'error' | 'uncertain'>>): void {
    if (sending.current || checking.current) return
    setCreateDraft((current) => {
      if (!current || current.uncertain) return current
      const nextFieldErrors = { ...current.fieldErrors }
      for (const key of Object.keys(patch) as CreateOccurrenceField[]) {
        delete nextFieldErrors[key]
      }
      if ('receivedDate' in patch || 'receivedTime' in patch) {
        delete nextFieldErrors.receivedDate
        delete nextFieldErrors.receivedTime
      }
      return {
        ...current,
        ...patch,
        fieldErrors: nextFieldErrors,
        error: '',
      }
    })
  }

  async function submitCreate(): Promise<CreateOccurrenceField | null> {
    if (!createDraft || sending.current || checking.current || createDraft.uncertain) return null
    const fieldErrors = validateCreateDraft(createDraft)
    const firstInvalid = (Object.keys(fieldErrors) as CreateOccurrenceField[])[0] ?? null
    if (firstInvalid) {
      setCreateDraft((current) => current && { ...current, fieldErrors, error: '' })
      return firstInvalid
    }

    const receivedAt = createDraft.receivedDate.trim() && createDraft.receivedTime.trim()
      ? buildMaceioReceivedAtIso(createDraft.receivedDate.trim(), createDraft.receivedTime.trim()) ?? undefined
      : undefined

    sending.current = true
    setSubmitting(true)
    const epoch = lifecycle.current
    try {
      const created = await createSvoOccurrence(api, {
        requesterName: createDraft.requesterName,
        requesterPhone: createDraft.requesterPhone,
        requesterType: createDraft.requesterType as SvoRequesterType,
        location: createDraft.location,
        description: createDraft.description,
        evidenceDescription: createDraft.evidenceDescription,
        notes: createDraft.notes,
        ...(receivedAt ? { receivedAt } : {}),
      })
      if (epoch !== lifecycle.current) return null
      setCreateDraft(null)
      setResult(`Solicitação SVO #${created.id} registrada com situação Pendente.`)
      await reload('Solicitação registrada, mas a listagem não pôde ser atualizada. Atualize a consulta antes de continuar.')
      return null
    } catch (error) {
      if (epoch !== lifecycle.current) return null
      const uncertain = isUncertainError(error) || !(error instanceof SvoOccurrenceRequestError)
      const msg = errorMessage(error, 'Não foi possível registrar a solicitação SVO.')
      setCreateDraft((current) => current && {
        ...current,
        error: uncertain
          ? `${msg} O resultado do envio é incerto. Consulte as solicitações antes de tentar novamente para evitar duplicidade.`
          : msg,
        uncertain,
      })
      return null
    } finally {
      if (epoch === lifecycle.current) {
        sending.current = false
        setSubmitting(false)
      }
    }
  }

  async function reconcileCreate(): Promise<void> {
    if (!createDraft || sending.current || checking.current) return
    checking.current = true
    setReconciling(true)
    const epoch = lifecycle.current
    try {
      await reload()
      if (epoch !== lifecycle.current) return
      setCreateDraft(null)
      setResult('Lista de solicitações atualizada. Confira os registros antes de enviar novamente.')
    } finally {
      if (epoch === lifecycle.current) {
        checking.current = false
        setReconciling(false)
      }
    }
  }

  const register = useCallback(async (input: CreateSvoOccurrenceInput): Promise<SvoOccurrenceCreationResult | null> => {
    if (sending.current || checking.current) return null
    sending.current = true
    setCreating(true)
    setSubmitting(true)
    setCreateError('')
    setResult('')
    const epoch = lifecycle.current
    try {
      const created = await createSvoOccurrence(api, input)
      if (epoch !== lifecycle.current) return null
      const summary: SvoOccurrenceSummary = {
        id: created.id,
        requesterType: input.requesterType,
        location: input.location.trim(),
        status: created.status,
        receivedAt: created.receivedAt,
        createdAt: created.createdAt,
        revision: created.revision,
      }
      setOccurrences((current) => current ? [summary, ...current.filter((item) => item.id !== created.id)] : [summary])
      setResult(`Solicitação #${created.id} registrada com status ${created.status}.`)
      const refreshed = await reload('A solicitação foi registrada, mas a lista não pôde ser atualizada. Atualize a consulta antes de continuar.')
      if (!refreshed && epoch === lifecycle.current) {
        setPartialWarning('A solicitação foi registrada, mas a lista pode estar desatualizada. Atualize a consulta.')
      }
      return created
    } catch (error) {
      if (epoch !== lifecycle.current) return null
      setCreateError(errorMessage(error))
      if (error instanceof SvoOccurrenceRequestError && error.kind === 'forbidden') setForbidden(true)
      if (isUncertainError(error)) {
        setPartialWarning('O resultado do cadastro é incerto. Consulte a lista antes de tentar registrar novamente.')
        await reload()
      }
      return null
    } finally {
      if (epoch === lifecycle.current) {
        sending.current = false
        setCreating(false)
        setSubmitting(false)
      }
    }
  }, [api, reload])

  async function loadConfirmDetail(id: string): Promise<void> {
    const sequence = ++confirmSequence.current
    setConfirmState({
      id,
      detail: null,
      loadingDetail: true,
      detailError: '',
      error: '',
      blocked: false,
      uncertain: false,
    })
    try {
      const loaded = await getSvoOccurrence(api, id)
      if (sequence !== confirmSequence.current) return
      const alreadyFinalized = loaded.status !== 'PENDING'
      setConfirmState({
        id,
        detail: loaded,
        loadingDetail: false,
        detailError: '',
        error: alreadyFinalized ? 'Esta solicitação já mudou de situação e não pode mais ser confirmada.' : '',
        blocked: alreadyFinalized,
        uncertain: false,
      })
    } catch (error) {
      if (sequence !== confirmSequence.current) return
      setConfirmState({
        id,
        detail: null,
        loadingDetail: false,
        detailError: errorMessage(error, 'Não foi possível carregar os campos de triagem da solicitação.'),
        error: '',
        blocked: true,
        uncertain: false,
      })
    }
  }

  function openConfirm(occurrence: SvoOccurrenceSummary): void {
    if (sending.current || checking.current || occurrence.status !== 'PENDING') return
    setResult('')
    void loadConfirmDetail(occurrence.id)
  }

  function closeConfirm(): void {
    if (!sending.current && !checking.current) {
      confirmSequence.current += 1
      setConfirmState(null)
    }
  }

  async function submitConfirm(): Promise<void> {
    if (!confirmState || confirmState.loadingDetail || confirmState.blocked || confirmState.uncertain || sending.current) {
      return
    }
    sending.current = true
    setSubmitting(true)
    const targetId = confirmState.id
    const targetDetail = confirmState.detail
    const epoch = lifecycle.current
    try {
      const confirmed = await confirmSvoOccurrence(api, targetDetail ?? targetId)
      if (epoch !== lifecycle.current) return
      setConfirmState(null)
      setDetail((current) => current?.id === targetId ? null : current)
      setResult(`Solicitação SVO #${confirmed.id} confirmada com sucesso.${formatDispatchSuffix(confirmed.dispatch)}`)
      await reload('Triagem confirmada, mas a listagem não pôde ser atualizada. Atualize a consulta antes de continuar.')
    } catch (error) {
      if (epoch !== lifecycle.current) return
      const kind = error instanceof SvoOccurrenceRequestError ? error.kind : 'network'
      const uncertain = kind === 'network' || kind === 'server' || kind === 'invalidResponse'
      const denied = kind === 'conflict' || kind === 'forbidden' || kind === 'notFound'
      const msg = errorMessage(error, 'Não foi possível confirmar a solicitação SVO.')
      setConfirmState((current) => current && {
        ...current,
        error: uncertain ? `${msg} O resultado é incerto. Consulte a situação antes de tentar novamente.` : msg,
        blocked: uncertain || denied || kind === 'session',
        uncertain,
      })
      if (denied) {
        setStale(true)
        await reload()
      }
    } finally {
      if (epoch === lifecycle.current) {
        sending.current = false
        setSubmitting(false)
      }
    }
  }

  async function reconcileConfirm(): Promise<void> {
    if (!confirmState || checking.current || sending.current) return
    checking.current = true
    setReconciling(true)
    const targetId = confirmState.id
    const epoch = lifecycle.current
    try {
      const current = await getSvoOccurrence(api, targetId)
      if (epoch !== lifecycle.current) return
      setConfirmState(null)
      setResult(
        current.status === 'CONFIRMED'
          ? `Situação da solicitação #${current.id} consultada: Confirmada.`
          : `Situação da solicitação #${current.id} consultada: ${current.status === 'PENDING' ? 'Pendente' : 'Cancelada'}.`,
      )
      await reload()
    } catch (error) {
      if (epoch !== lifecycle.current) return
      setConfirmState((current) => current && {
        ...current,
        error: `${errorMessage(error, 'Falha na consulta.')} A confirmação anterior continua sem resultado conhecido.`,
      })
    } finally {
      if (epoch === lifecycle.current) {
        checking.current = false
        setReconciling(false)
      }
    }
  }

  const confirm = useCallback(async (occurrence: SvoOccurrenceDetail): Promise<SvoOccurrenceConfirmationResult | null> => {
    if (sending.current || checking.current || occurrence.status !== 'PENDING') return null
    sending.current = true
    setConfirming(true)
    setSubmitting(true)
    setConfirmationError('')
    setConfirmationBlocked(false)
    setResult('')
    const epoch = lifecycle.current
    try {
      const confirmed = await confirmSvoOccurrence(api, occurrence)
      if (epoch !== lifecycle.current) return null
      setOccurrences((current) => current?.map((item) => item.id === confirmed.id
        ? { ...item, status: confirmed.status, revision: confirmed.revision }
        : item) ?? null)
      setDetail((current) => current?.id === confirmed.id && current.data
        ? { ...current, data: { ...current.data, status: confirmed.status, triagedAt: confirmed.triagedAt, triagedBy: confirmed.triagedBy, revision: confirmed.revision } }
        : current)
      setResult(`Solicitação #${confirmed.id} confirmada após conferência dos dados recebidos.${formatDispatchSuffix(confirmed.dispatch)}`)
      const refreshed = await reload('A confirmação foi concluída, mas a lista não pôde ser atualizada. Atualize a consulta.')
      if (!refreshed && epoch === lifecycle.current) {
        setPartialWarning('A confirmação foi concluída, mas a lista pode estar desatualizada. Atualize a consulta.')
      }
      return confirmed
    } catch (error) {
      if (epoch !== lifecycle.current) return null
      setConfirmationError(errorMessage(error))
      const kind = error instanceof SvoOccurrenceRequestError ? error.kind : 'network'
      if (kind === 'forbidden') setForbidden(true)
      if (['network', 'server', 'invalidResponse', 'conflict', 'notFound', 'forbidden', 'session'].includes(kind)) {
        setConfirmationBlocked(true)
      }
      if (isUncertainError(error) || kind === 'conflict' || kind === 'notFound') await reload()
      return null
    } finally {
      if (epoch === lifecycle.current) {
        sending.current = false
        setConfirming(false)
        setSubmitting(false)
      }
    }
  }, [api, reload])

  const retryDispatch = useCallback(async (occurrence: SvoOccurrenceSummary): Promise<boolean> => {
    if (sending.current || checking.current || !isAwaitingSvoDispatch(occurrence)) {
      return false
    }
    sending.current = true
    setDispatchingId(occurrence.id)
    setDispatchError('')
    setResult('')
    const epoch = lifecycle.current
    try {
      const outcome = await retrySvoDispatch(api, occurrence)
      if (epoch !== lifecycle.current) return false
      setResult(outcome.status === 'DISPATCHED'
        ? `Ordem #${outcome.orderId} criada automaticamente para a solicitação #${occurrence.id}.`
        : `A solicitação #${occurrence.id} continua aguardando recurso elegível.`)
      const refreshed = await reload('A tentativa foi registrada, mas a fila não pôde ser atualizada. Recarregue antes de tentar novamente.')
      if (!refreshed && epoch === lifecycle.current) {
        setPartialWarning('A tentativa foi registrada; consulte a fila antes de repetir a ação.')
      }
      return true
    } catch (error) {
      if (epoch !== lifecycle.current) return false
      setDispatchError(errorMessage(error))
      const kind = error instanceof SvoOccurrenceRequestError ? error.kind : 'network'
      if (kind === 'forbidden') setForbidden(true)
      if (isUncertainError(error) || kind === 'conflict' || kind === 'notFound') await reload()
      return false
    } finally {
      if (epoch === lifecycle.current) {
        sending.current = false
        setDispatchingId(null)
      }
    }
  }, [api, reload])

  const loadDispatchCandidates = useCallback(async (occurrenceId: string): Promise<void> => {
    const sequence = ++dispatchSequence.current
    setDispatchDraft((current) => current && {
      ...current,
      candidatesLoading: true,
      candidatesError: '',
    })
    try {
      const [candidates, existingOrders] = await Promise.all([
        listSvoDispatchCandidates(api),
        listSvoDispatchOrders(api).catch(() => null),
      ])
      if (sequence !== dispatchSequence.current) return
      if (existingOrders) {
        setOrders(existingOrders)
        setOrdersSyncWarning('')
      }
      const existingOrder = existingOrders?.find((order) => order.occurrenceId === occurrenceId)
      setDispatchDraft((current) => {
        if (!current) return null
        const stillValidTeam = candidates.teams.some((team) => team.id === current.teamId)
        const stillValidVehicle = candidates.vehicles.some(
          (vehicle) => vehicle.id === current.vehicleId && vehicle.availableSlots > 0,
        )
        return {
          ...current,
          candidatesLoading: false,
          candidatesError: '',
          teams: candidates.teams,
          vehicles: candidates.vehicles,
          teamId: stillValidTeam ? current.teamId : '',
          vehicleId: stillValidVehicle ? current.vehicleId : '',
          blocked: Boolean(existingOrder),
          error: existingOrder
            ? `Esta solicitação já possui a ordem #${existingOrder.id} (${SVO_DISPATCH_ORDER_STATUS_LABELS[existingOrder.status] ?? existingOrder.status}).`
            : current.error,
        }
      })
    } catch (error) {
      if (sequence !== dispatchSequence.current) return
      setDispatchDraft((current) => current && {
        ...current,
        candidatesLoading: false,
        candidatesError: errorMessage(error, 'Não foi possível consultar os candidatos elegíveis do SVO.'),
      })
    }
  }, [api])

  function openDispatch(occurrence: SvoOccurrenceSummary): void {
    if (sending.current || checking.current || occurrence.status !== 'CONFIRMED') return
    if (ordersByOccurrenceId.has(occurrence.id)) return
    setResult('')
    setDispatchDraft({
      occurrence,
      teamId: '',
      vehicleId: '',
      candidatesLoading: true,
      candidatesError: '',
      teams: [],
      vehicles: [],
      fieldErrors: {},
      error: '',
      blocked: false,
      uncertain: false,
    })
    void loadDispatchCandidates(occurrence.id)
  }

  function closeDispatch(): void {
    if (!sending.current && !checking.current) {
      dispatchSequence.current += 1
      setDispatchDraft(null)
    }
  }

  function updateDispatchDraft(patch: Partial<Pick<DispatchOrderDraft, 'teamId' | 'vehicleId'>>): void {
    if (sending.current || checking.current) return
    setDispatchDraft((current) => {
      if (!current || current.uncertain) return current
      const nextErrors = { ...current.fieldErrors }
      if ('teamId' in patch) delete nextErrors.teamId
      if ('vehicleId' in patch) delete nextErrors.vehicleId
      return {
        ...current,
        ...patch,
        fieldErrors: nextErrors,
        error: '',
      }
    })
  }

  async function submitDispatch(): Promise<DispatchOrderField | null> {
    if (!dispatchDraft || sending.current || checking.current || dispatchDraft.blocked || dispatchDraft.uncertain) {
      return null
    }
    const fieldErrors: Partial<Record<DispatchOrderField, string>> = {}
    const selectedTeam = dispatchDraft.teams.find((team) => team.id === dispatchDraft.teamId)
    if (!dispatchDraft.teamId || !isCanonicalBigIntId(dispatchDraft.teamId) || !selectedTeam) {
      fieldErrors.teamId = 'Selecione uma equipe SVO ativa.'
    }
    const selectedVehicle = dispatchDraft.vehicles.find((vehicle) => vehicle.id === dispatchDraft.vehicleId)
    if (!dispatchDraft.vehicleId) {
      fieldErrors.vehicleId = 'Selecione uma viatura SVO elegível.'
    } else if (!selectedVehicle || selectedVehicle.availableSlots < 1) {
      fieldErrors.vehicleId = 'A viatura selecionada não possui vaga livre. Escolha outra viatura.'
    }

    const firstInvalid = (Object.keys(fieldErrors) as DispatchOrderField[])[0] ?? null
    if (firstInvalid) {
      setDispatchDraft((current) => current && { ...current, fieldErrors, error: '' })
      return firstInvalid
    }

    sending.current = true
    setSubmitting(true)
    const targetOccurrenceId = dispatchDraft.occurrence.id
    const selectedTeamId = dispatchDraft.teamId
    const selectedTeamName = selectedTeam!.name
    const epoch = lifecycle.current
    try {
      const created = await createSvoOrderDispatch(api, {
        occurrenceId: targetOccurrenceId,
        teamId: selectedTeamId,
        vehicleId: dispatchDraft.vehicleId,
      })
      if (epoch !== lifecycle.current) return null
      setOrders((current) => [
        {
          id: created.id,
          occurrenceId: targetOccurrenceId,
          teamId: selectedTeamId,
          vehicleId: dispatchDraft.vehicleId,
          status: created.status,
          teamName: selectedTeamName,
          vehicleLicensePlate: selectedVehicle?.plate ?? '',
        },
        ...current.filter((item) => item.occurrenceId !== targetOccurrenceId),
      ])
      setDispatchDraft(null)
      setDetail((current) => current?.id === targetOccurrenceId ? null : current)
      setResult(`Ordem SVO #${created.id} gerada com situação Aberta para a solicitação #${targetOccurrenceId}.`)
      await reload('Ordem gerada com sucesso, mas a listagem não pôde ser atualizada. Atualize a consulta antes de continuar.')
      return null
    } catch (error) {
      if (epoch !== lifecycle.current) return null
      const kind = error instanceof SvoOccurrenceRequestError ? error.kind : 'network'
      const uncertain = kind === 'network' || kind === 'server' || kind === 'invalidResponse'
      const msg = errorMessage(error, 'Não foi possível gerar a ordem SVO.')
      setDispatchDraft((current) => current && {
        ...current,
        error: uncertain
          ? `${msg} O resultado é incerto. Consulte a situação antes de tentar novamente para evitar duplicidade.`
          : msg,
        blocked: uncertain || kind === 'forbidden' || kind === 'session',
        uncertain,
      })
      if (kind === 'conflict') {
        await loadDispatchCandidates(targetOccurrenceId)
        await reload()
      }
      return null
    } finally {
      if (epoch === lifecycle.current) {
        sending.current = false
        setSubmitting(false)
      }
    }
  }

  async function reconcileDispatch(): Promise<void> {
    if (!dispatchDraft || checking.current || sending.current) return
    checking.current = true
    setReconciling(true)
    const targetOccurrenceId = dispatchDraft.occurrence.id
    const epoch = lifecycle.current
    try {
      const latestOrders = await listSvoDispatchOrders(api)
      if (epoch !== lifecycle.current) return
      setOrders(latestOrders)
      setOrdersSyncWarning('')
      const found = latestOrders.find((order) => order.occurrenceId === targetOccurrenceId)
      if (found) {
        setDispatchDraft(null)
        setDetail((current) => current?.id === targetOccurrenceId ? null : current)
        setResult(`Ordem #${found.id} localizada para a solicitação #${targetOccurrenceId} (${SVO_DISPATCH_ORDER_STATUS_LABELS[found.status] ?? found.status}).`)
        await reload()
      } else {
        setDispatchDraft((current) => current && {
          ...current,
          uncertain: false,
          blocked: false,
          error: 'Nenhuma ordem foi encontrada para esta solicitação após a consulta. Revise os dados e tente novamente se necessário.',
        })
        await loadDispatchCandidates(targetOccurrenceId)
      }
    } catch (error) {
      if (epoch !== lifecycle.current) return
      setDispatchDraft((current) => current && {
        ...current,
        error: `${errorMessage(error, 'Falha na consulta.')} A geração anterior continua sem resultado conhecido.`,
      })
    } finally {
      if (epoch === lifecycle.current) {
        checking.current = false
        setReconciling(false)
      }
    }
  }

  const clearCreateError = useCallback((): void => {
    setCreateError('')
  }, [])

  const clearConfirmationError = useCallback((): void => {
    setConfirmationError('')
    setConfirmationBlocked(false)
  }, [])

  return {
    filterDraft,
    appliedFilters,
    filters: appliedFilters,
    filterErrors,
    occurrences,
    ordersByOccurrenceId,
    ordersSyncWarning,
    loading,
    listError,
    listErrorKind,
    partialWarning,
    stale,
    forbidden,
    permissionDenied: forbidden,
    result,
    notice: result,
    detail,
    createDraft,
    confirmState,
    dispatchDraft,
    submitting,
    reconciling,
    creating,
    createError,
    confirming,
    confirmationError,
    confirmationBlocked,
    dispatchingId,
    dispatchError,
    reload,
    updateFilterDraft,
    applyFilters,
    clearFilters,
    changeFilters,
    openDetail,
    closeDetail,
    openCreate,
    closeCreate,
    updateCreateDraft,
    submitCreate,
    reconcileCreate,
    register,
    openConfirm,
    closeConfirm,
    submitConfirm,
    reconcileConfirm,
    confirm,
    retryDispatch,
    openDispatch,
    closeDispatch,
    updateDispatchDraft,
    loadDispatchCandidates,
    submitDispatch,
    reconcileDispatch,
    clearCreateError,
    clearConfirmationError,
  }
}
