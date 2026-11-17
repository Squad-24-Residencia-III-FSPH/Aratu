import { useCallback, useEffect, useRef, useState } from 'react'
import type { ApiRequest } from '../api/client'
import { getSvoOrder, listSvoOrders, recordSvoOrderResult, updateSvoOrderStatus } from '../services/svoOrdersService'
import { isActiveSvoOrder, orderClosedAnnouncement, SVO_ORDER_LABELS } from '../svo/svoOrderPresentation'
import { SvoOrderRequestError } from '../svo/svoOrderTypes'
import type {
  SvoOrderDetail, SvoOrderFilter, SvoOrderResult, SvoOrderSummary, SvoOrderTransition,
} from '../svo/svoOrderTypes'

interface OrderDraft {
  order: SvoOrderSummary
  action: SvoOrderTransition
  error: string
  blocked: boolean
}
export interface OrderResultDraft {
  order: SvoOrderSummary
  result: SvoOrderResult | ''
  failureReason: string
  notes: string
  step: 'form' | 'confirm'
  resultError: string
  reasonError: string
  error: string
  blocked: boolean
}
interface OrderDetailState { id: string; data: SvoOrderDetail | null; loading: boolean; error: string }
const message = (error: unknown): string => error instanceof Error ? error.message : 'Não foi possível consultar as ordens. Tente novamente.'

function matchesFilter(order: SvoOrderSummary, filter: SvoOrderFilter): boolean {
  if (!filter) return true
  if (filter === 'ACTIVE') return isActiveSvoOrder(order.status)
  return order.status === filter
}

/**
 * Consulta e confirmação em memória: descarta respostas antigas e impede reenvio com resultado incerto.
 * A página remonta este estado ao trocar a sessão, apagando conteúdo operacional e diálogos.
 */
export function useSvoOrders(api: ApiRequest, operational = true) {
  const [orders, setOrders] = useState<SvoOrderSummary[] | null>(null)
  const [filter, setFilter] = useState<SvoOrderFilter>(operational ? 'ACTIVE' : '')
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState('')
  const [stale, setStale] = useState(false)
  const [detail, setDetail] = useState<OrderDetailState | null>(null)
  const [draft, setDraft] = useState<OrderDraft | null>(null)
  const [resultDraft, setResultDraft] = useState<OrderResultDraft | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState('')
  const [uncertainId, setUncertainId] = useState<string | null>(null)
  const [reconciling, setReconciling] = useState(false)
  const listSequence = useRef(0)
  const detailSequence = useRef(0)
  const lifecycle = useRef(0)
  const sending = useRef(false)
  const checking = useRef(false)

  const reload = useCallback(async (partialMessage?: string): Promise<void> => {
    const sequence = ++listSequence.current
    setLoading(true)
    try {
      const next = await listSvoOrders(api, filter === 'ACTIVE' ? '' : filter)
      if (sequence !== listSequence.current) return
      setOrders(next.filter((order) => matchesFilter(order, filter))); setListError(''); setStale(false)
    } catch (error) {
      if (sequence !== listSequence.current) return
      setListError(partialMessage ?? message(error)); setStale(true)
    } finally {
      if (sequence === listSequence.current) setLoading(false)
    }
  }, [api, filter])

  const invalidate = useCallback(() => { lifecycle.current++; listSequence.current++; detailSequence.current++ }, [])
  useEffect(() => {
    void reload()
    return invalidate
  }, [reload, invalidate])

  function changeFilter(value: SvoOrderFilter): void {
    if (sending.current || checking.current || value === filter) return
    listSequence.current++; detailSequence.current++
    setFilter(value); setOrders(null); setListError(''); setDetail(null); setDraft(null); setResultDraft(null); setLoading(true)
  }

  async function openDetail(id: string): Promise<void> {
    const sequence = ++detailSequence.current
    setDetail({ id, data: null, loading: true, error: '' })
    try {
      const data = await getSvoOrder(api, id)
      if (sequence === detailSequence.current) setDetail({ id, data, loading: false, error: '' })
    } catch (error) {
      if (sequence === detailSequence.current) setDetail({ id, data: null, loading: false, error: message(error) })
    }
  }

  function closeDetail(): void { detailSequence.current++; setDetail(null) }

  function openAction(order: SvoOrderSummary, action: SvoOrderTransition): void {
    if (sending.current || loading || stale || uncertainId || !order.allowedTransitions.includes(action)) return
    setResult(''); setResultDraft(null); setDraft({ order, action, error: '', blocked: false })
  }

  function closeAction(): void { if (!sending.current) setDraft(null) }

  function openResult(order: SvoOrderSummary): void {
    if (sending.current || loading || stale || uncertainId || order.allowedResults.length === 0) return
    setResult(''); setDraft(null)
    setResultDraft({
      order, result: '', failureReason: '', notes: '', step: 'form',
      resultError: '', reasonError: '', error: '', blocked: false,
    })
  }

  function closeResult(): void { if (!sending.current) setResultDraft(null) }

  function updateResultDraft(patch: Partial<Pick<OrderResultDraft, 'result' | 'failureReason' | 'notes'>>): void {
    if (sending.current) return
    setResultDraft((current) => current && !current.blocked ? {
      ...current,
      ...patch,
      resultError: 'result' in patch ? '' : current.resultError,
      reasonError: 'failureReason' in patch || patch.result === 'COMPLETED' ? '' : current.reasonError,
      error: '',
    } : current)
  }

  function reviewResult(): void {
    if (!resultDraft || sending.current || resultDraft.blocked || loading || stale || uncertainId) return
    if (!resultDraft.result || !resultDraft.order.allowedResults.includes(resultDraft.result)) {
      setResultDraft((current) => current && { ...current, resultError: 'Selecione o resultado do atendimento.', error: '' })
      return
    }
    if (resultDraft.result === 'NOT_PERFORMED' && !resultDraft.failureReason.trim()) {
      setResultDraft((current) => current && { ...current, resultError: '', reasonError: 'Informe o motivo da não realização.', error: '' })
      return
    }
    setResultDraft((current) => current && { ...current, step: 'confirm', resultError: '', reasonError: '', error: '' })
  }

  function backToResultForm(): void {
    if (sending.current) return
    setResultDraft((current) => {
      if (!current) return null
      if (current.blocked) return null
      return { ...current, step: 'form', error: '' }
    })
  }

  async function submit(): Promise<void> {
    if (!draft || sending.current || draft.blocked || loading || stale || uncertainId) return
    sending.current = true; setSubmitting(true)
    listSequence.current++; detailSequence.current++
    const epoch = lifecycle.current
    try {
      const confirmed = await updateSvoOrderStatus(api, draft.order, draft.action)
      if (epoch !== lifecycle.current) return
      detailSequence.current++
      setOrders((current) => current?.map((order) => order.id === confirmed.id ? confirmed : order)
        .filter((order) => matchesFilter(order, filter)) ?? null)
      setDetail(null); setDraft(null)
      setResult(`${draft.action === 'IN_TRANSIT' ? 'Saída' : 'Chegada'} da ordem #${confirmed.id} registrada.`)
      await reload('O registro foi confirmado, mas a lista não pôde ser atualizada. Atualize a consulta antes de continuar.')
    } catch (error) {
      if (epoch !== lifecycle.current) return
      const kind = error instanceof SvoOrderRequestError ? error.kind : 'network'
      const uncertain = kind === 'network' || kind === 'server' || kind === 'invalidResponse'
      const denied = kind === 'forbidden' || kind === 'conflict' || kind === 'notFound'
      const guidance = uncertain ? ' O resultado é incerto. Consulte a situação antes de tentar novamente.' : ''
      setDraft((current) => current && { ...current, error: message(error) + guidance, blocked: uncertain || denied || kind === 'session' })
      if (uncertain) setUncertainId(draft.order.id)
      if (denied) {
        setStale(true)
        setOrders((current) => current?.map((order) => order.id === draft.order.id
          ? { ...order, allowedTransitions: [], allowedResults: [] } : order) ?? null)
        await reload()
      }
    } finally {
      if (epoch === lifecycle.current) { sending.current = false; setSubmitting(false) }
    }
  }

  async function submitResult(): Promise<void> {
    if (!resultDraft || resultDraft.step !== 'confirm' || !resultDraft.result
      || sending.current || resultDraft.blocked || loading || stale || uncertainId) return
    sending.current = true; setSubmitting(true)
    listSequence.current++; detailSequence.current++
    const epoch = lifecycle.current
    try {
      const confirmed = await recordSvoOrderResult(api, resultDraft.order, {
        result: resultDraft.result,
        failureReason: resultDraft.result === 'NOT_PERFORMED' ? resultDraft.failureReason : null,
        notes: resultDraft.notes,
      })
      if (epoch !== lifecycle.current) return
      detailSequence.current++
      setOrders((current) => current?.map((order) => order.id === confirmed.id ? confirmed : order)
        .filter((order) => matchesFilter(order, filter)) ?? null)
      setDetail(null); setResultDraft(null)
      setResult(orderClosedAnnouncement(confirmed.id, confirmed.result!))
      await reload('O encerramento foi confirmado, mas a lista não pôde ser atualizada. Atualize a consulta antes de continuar.')
    } catch (error) {
      if (epoch !== lifecycle.current) return
      const kind = error instanceof SvoOrderRequestError ? error.kind : 'network'
      if (kind === 'validation') {
        const msg = message(error)
        setResultDraft((current) => current && {
          ...current,
          step: 'form',
          reasonError: current.result === 'NOT_PERFORMED' ? msg : '',
          error: msg,
          blocked: false,
        })
        return
      }
      const uncertain = kind === 'network' || kind === 'server' || kind === 'invalidResponse'
      const denied = kind === 'forbidden' || kind === 'conflict' || kind === 'notFound'
      const guidance = uncertain ? ' O resultado é incerto. Consulte a situação antes de tentar novamente.' : ''
      setResultDraft((current) => current && {
        ...current,
        error: message(error) + guidance,
        blocked: uncertain || denied || kind === 'session',
      })
      if (uncertain) setUncertainId(resultDraft.order.id)
      if (denied) {
        setStale(true)
        setOrders((current) => current?.map((order) => order.id === resultDraft.order.id
          ? { ...order, allowedTransitions: [], allowedResults: [] } : order) ?? null)
        await reload()
      }
    } finally {
      if (epoch === lifecycle.current) { sending.current = false; setSubmitting(false) }
    }
  }

  async function reconcile(): Promise<void> {
    if (!uncertainId || checking.current || sending.current) return
    checking.current = true; setReconciling(true)
    const epoch = lifecycle.current
    try {
      const current = await getSvoOrder(api, uncertainId)
      if (epoch !== lifecycle.current) return
      setDraft(null); setResultDraft(null); setUncertainId(null); setDetail(null)
      setOrders((previous) => previous?.map((order) => order.id === current.id ? current : order)
        .filter((order) => matchesFilter(order, filter)) ?? null)
      setResult(`Situação da ordem #${current.id} consultada: ${SVO_ORDER_LABELS[current.status]}. Confira os dados antes de escolher uma nova ação.`)
      await reload()
    } catch (error) {
      if (epoch !== lifecycle.current) return
      const reconciliationError = `${message(error)} A confirmação anterior continua sem resultado conhecido.`
      setDraft((current) => current && { ...current, error: reconciliationError })
      setResultDraft((current) => current && { ...current, error: reconciliationError })
      setListError(message(error)); setStale(true)
    } finally {
      if (epoch === lifecycle.current) { checking.current = false; setReconciling(false) }
    }
  }

  return {
    orders, filter, loading, listError, stale, detail, draft, resultDraft, submitting, result, uncertainId, reconciling,
    reload, changeFilter, openDetail, closeDetail, openAction, closeAction,
    openResult, closeResult, updateResultDraft, reviewResult, backToResultForm, submit, submitResult, reconcile,
  }
}
