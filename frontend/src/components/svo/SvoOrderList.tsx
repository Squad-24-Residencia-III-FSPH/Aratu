import { useEffect, useId, useRef } from 'react'
import { Alert, Box, Button, Typography } from '@mui/material'
import type { ApiRequest } from '../../api/client'
import { useSvoOrders } from '../../hooks/useSvoOrders'
import type { SvoOrderSummary, SvoOrderTransition } from '../../svo/svoOrderTypes'
import { SVO_ORDER_STATUSES } from '../../svo/svoOrderTypes'
import { SVO_ACTION_LABELS, SVO_ORDER_LABELS, SVO_ORDER_TONES, MISSING_DISPATCH, MISSING_RECORD, formatDateTime, orderConfirmation } from '../../svo/svoOrderPresentation'
import { EntityCard } from '../ui/EntityCard'
import { FormSelect } from '../ui/FormField'
import PageHeader from '../ui/PageHeader'
import StateFeedback from '../ui/StateFeedback'
import StatusChip from '../ui/StatusChip'
import ConfirmDialog from '../ui/ConfirmDialog'
import SvoOrderDetails from './SvoOrderDetails'
import SvoOrderResultDialog from './SvoOrderResultDialog'

/** A página configura a operação ou a consulta; a API fornece as ações efetivamente autorizadas. */
interface SvoOrderListProps { api: ApiRequest; operational: boolean }

const FILTER_OPTIONS = [
  { value: 'ACTIVE', label: 'Ativas' },
  ...SVO_ORDER_STATUSES.map((value) => ({ value, label: SVO_ORDER_LABELS[value] })),
]
const FOCUS_SX = { '& :focus-visible': { outline: '2px solid', outlineColor: 'text.primary', outlineOffset: 2 } }

export default function SvoOrderList({ api, operational }: SvoOrderListProps) {
  const state = useSvoOrders(api, operational)
  const title = operational ? 'Ordens da equipe' : 'Acompanhamento de ordens'
  const headingId = useId()
  const resultRef = useRef<HTMLDivElement>(null)
  const listHeadingRef = useRef<HTMLHeadingElement>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const busy = state.submitting || state.reconciling
  const { result, draft, resultDraft, detail } = state

  useEffect(() => {
    const previous = document.title
    document.title = `${title} — Aratu`
    return () => { document.title = previous }
  }, [title])

  // O diálogo devolve foco ao acionador; quando a etapa some, usa a mensagem ou título da lista.
  useEffect(() => {
    if (draft || resultDraft || detail || !triggerRef.current) return
    const frame = requestAnimationFrame(() => {
      if (triggerRef.current?.isConnected && !triggerRef.current.disabled) triggerRef.current.focus()
      else if (result) resultRef.current?.focus()
      else listHeadingRef.current?.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [draft, resultDraft, detail, result])

  function content() {
    if (state.orders === null) return state.loading
      ? <StateFeedback kind="loading" title="Carregando ordens..." />
      : <StateFeedback kind="error" title="Não foi possível carregar as ordens." description={state.listError} actionLabel="Tentar novamente" onAction={() => { void state.reload() }} />
    if (state.orders.length === 0) return <StateFeedback kind="empty"
      title={state.filter === 'ACTIVE' ? (operational ? 'Nenhuma ordem ativa para sua equipe' : 'Nenhuma ordem ativa disponível')
        : state.filter ? 'Nenhuma ordem encontrada para esta situação' : operational ? 'Nenhuma ordem disponível para sua equipe' : 'Nenhuma ordem disponível'}
      actionLabel={state.filter ? 'Limpar filtro' : 'Atualizar'} onAction={() => { if (state.filter) state.changeFilter(''); else void state.reload() }} />
    return state.orders.map((order) => <OrderCard key={order.id} order={order} operational={operational}
      disabled={busy || state.loading || state.stale || Boolean(state.uncertainId)}
      onDetail={(trigger) => { triggerRef.current = trigger; void state.openDetail(order.id) }}
      onAction={(action, trigger) => { triggerRef.current = trigger; state.openAction(order, action) }}
      onResult={(trigger) => { triggerRef.current = trigger; state.openResult(order) }} />)
  }

  return <Box sx={{ maxWidth: 960, minWidth: 0, overflowWrap: 'anywhere', ...FOCUS_SX,
    '& .MuiChip-root': { height: 'auto', minHeight: 26, maxWidth: '100%' },
    '& .MuiChip-label': { whiteSpace: 'normal', py: 0.5 } }}>
    <PageHeader title={title} titleVariant="h4"
      description={operational ? 'Consulte suas ordens, confirme saída e chegada e registre o resultado do atendimento.' : 'Consulte as ordens e atualize a lista para acompanhar a equipe.'}
      actions={<>
        <Box sx={{ minWidth: { sm: 210 }, flex: { xs: '1 1 100%', sm: '0 0 auto' } }}>
          <FormSelect label="Situação" value={state.filter} emptyLabel="Todas" displayEmpty options={FILTER_OPTIONS}
            sx={{ '& .MuiOutlinedInput-notchedOutline': { borderColor: 'text.primary' },
              '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'text.primary' },
              '& .MuiInputLabel-root.Mui-focused': { color: 'text.primary' } }}
            disabled={busy} onChange={(value) => { if (value === '' || value === 'ACTIVE' || SVO_ORDER_STATUSES.some((status) => status === value)) state.changeFilter(value as typeof state.filter) }} />
        </Box>
        <Button variant="outlined" color="inherit" sx={{ borderColor: 'text.primary' }} disabled={state.loading || busy} onClick={() => { void state.reload() }}>
          {state.loading && state.orders !== null ? 'Atualizando...' : 'Atualizar'}
        </Button>
      </>} />
    <Box ref={resultRef} role="status" aria-live="polite" tabIndex={-1}>
      {state.result && <Alert severity="success" sx={{ mb: 2 }}>{state.result}</Alert>}
    </Box>
    {state.orders !== null && state.stale && <StateFeedback kind="partial" title="A lista pode estar desatualizada."
      description={state.listError} actionLabel="Atualizar consulta" onAction={() => { void state.reload() }} />}
    {state.uncertainId && !state.draft && !state.resultDraft && <StateFeedback kind="partial" title={`O resultado da ordem #${state.uncertainId} é incerto.`}
      description="Consulte a situação antes de escolher uma nova ação." actionLabel="Consultar situação" onAction={() => { void state.reconcile() }} />}
    <Box component="section" aria-labelledby={headingId} aria-busy={state.loading}>
      <Typography ref={listHeadingRef} id={headingId} component="h2" variant="h6" tabIndex={-1} sx={{ mb: 2 }}>Ordens {state.filter === 'ACTIVE' ? '— Ativas' : state.filter ? `— ${SVO_ORDER_LABELS[state.filter]}` : '— Todas'}</Typography>
      {content()}
    </Box>
    {detail && <SvoOrderDetails id={detail.id} order={detail.data} loading={detail.loading} error={detail.error}
      onRetry={() => { void state.openDetail(detail.id) }} onClose={state.closeDetail} />}
    {draft && <ConfirmDialog open title={SVO_ACTION_LABELS[draft.action]} sx={FOCUS_SX}
      description={<>{orderConfirmation(draft.order.id, draft.action)}<Typography sx={{ mt: 1 }}>Local do despacho: {draft.order.dispatch.location ?? MISSING_DISPATCH}</Typography></>}
      confirmLabel={SVO_ACTION_LABELS[draft.action]} cancelLabel="Voltar" loading={state.submitting}
      confirmDisabled={draft.blocked || state.loading || state.stale || Boolean(state.uncertainId)}
      onConfirm={() => { void state.submit() }} onCancel={state.closeAction} autoFocusCancel>
      {draft.error && <Alert severity="error" sx={{ mt: 2 }}>{draft.error}</Alert>}
      {draft.blocked && !state.uncertainId && <Typography sx={{ mt: 1 }}>Volte à lista atualizada e escolha novamente a ação disponível.</Typography>}
      {state.uncertainId && <Button color="inherit" disabled={busy} onClick={() => { void state.reconcile() }}>{state.reconciling ? 'Consultando...' : 'Consultar situação'}</Button>}
    </ConfirmDialog>}
    {resultDraft && <SvoOrderResultDialog draft={resultDraft} submitting={state.submitting} reconciling={state.reconciling}
      uncertain={Boolean(state.uncertainId)} disabled={state.loading || state.stale || Boolean(state.uncertainId)}
      onChange={state.updateResultDraft} onReview={state.reviewResult} onBack={state.backToResultForm}
      onClose={state.closeResult} onConfirm={() => { void state.submitResult() }} onReconcile={() => { void state.reconcile() }} />}
  </Box>
}

/** Card sem I/O, com título/status semânticos e comandos identificando sua ordem. */
interface OrderCardProps {
  order: SvoOrderSummary
  operational: boolean
  disabled: boolean
  onDetail: (trigger: HTMLButtonElement) => void
  onAction: (action: SvoOrderTransition, trigger: HTMLButtonElement) => void
  onResult: (trigger: HTMLButtonElement) => void
}

function OrderCard({ order, operational, disabled, onDetail, onAction, onResult }: OrderCardProps) {
  return <EntityCard>
    <EntityCard.Header title={`Ordem #${order.id}`}>
      <EntityCard.Status><StatusChip label={SVO_ORDER_LABELS[order.status]} tone={SVO_ORDER_TONES[order.status]} /></EntityCard.Status>
    </EntityCard.Header>
    <EntityCard.Body>
      <Typography>Local do despacho: {order.dispatch.location ?? MISSING_DISPATCH}</Typography>
      <Typography>Equipe no despacho: {order.dispatch.teamName ?? MISSING_DISPATCH}</Typography>
      <Typography>Veículo no despacho: {order.dispatch.vehicleLicensePlate ?? MISSING_DISPATCH}</Typography>
      {(['location', 'teamName', 'vehicleLicensePlate'] as const).some((key) => order.dispatch[key] === null)
        && <Typography variant="body2">Informação histórica parcialmente indisponível.</Typography>}
      {order.dispatch.location !== order.current.location && <Typography>Local atual: {order.current.location}</Typography>}
      {order.dispatch.teamName !== order.current.teamName && <Typography>Equipe atual: {order.current.teamName}</Typography>}
      {order.dispatch.vehicleLicensePlate !== order.current.vehicleLicensePlate && <Typography>Veículo atual: {order.current.vehicleLicensePlate}</Typography>}
      {(order.result !== null || order.status === 'COMPLETED' || order.status === 'NOT_PERFORMED')
        && <Typography>Resultado: {order.result ? SVO_ORDER_LABELS[order.result] : MISSING_RECORD}</Typography>}
      <Typography>Aberta em: {formatDateTime(order.openedAt)}</Typography>
      {order.departedAt && <Typography>Saída: {formatDateTime(order.departedAt)}</Typography>}
      {order.arrivedAt && <Typography>Chegada: {formatDateTime(order.arrivedAt)}</Typography>}
      {order.collectedAt && <Typography>Coleta: {formatDateTime(order.collectedAt)}</Typography>}
      {order.closedAt && <Typography>Encerrada em: {formatDateTime(order.closedAt)}</Typography>}
    </EntityCard.Body>
    <EntityCard.Actions>
      <Button color="inherit" aria-label={`Ver detalhes da ordem #${order.id}`} onClick={(event) => onDetail(event.currentTarget)}>Ver detalhes</Button>
      {operational && order.allowedTransitions.map((action) => <Button key={action} variant="contained" disabled={disabled}
        aria-label={`${SVO_ACTION_LABELS[action]} da ordem #${order.id}`} onClick={(event) => onAction(action, event.currentTarget)}>{SVO_ACTION_LABELS[action]}</Button>)}
      {operational && order.allowedResults.length > 0 && <Button variant="contained" disabled={disabled}
        aria-label={`Encerrar ordem #${order.id}`} onClick={(event) => onResult(event.currentTarget)}>Encerrar</Button>}
    </EntityCard.Actions>
  </EntityCard>
}
