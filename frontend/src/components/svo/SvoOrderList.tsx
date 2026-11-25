import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { Alert, Box, Button, Stack, Typography } from '@mui/material'
import type { ApiRequest } from '../../api/client'
import { useSvoOrders } from '../../hooks/useSvoOrders'
import type { SvoOrderSummary, SvoOrderTransition } from '../../svo/svoOrderTypes'
import { SVO_ORDER_STATUSES } from '../../svo/svoOrderTypes'
import { SVO_ACTION_LABELS, SVO_ORDER_LABELS, SVO_ORDER_TONES, MISSING_DISPATCH, MISSING_RECORD, formatDateTime, orderConfirmation } from '../../svo/svoOrderPresentation'
import { EntityCard } from '../ui/EntityCard'
import { FormSelect } from '../ui/FormField'
import PageHeader from '../ui/PageHeader'
import FilterBar from '../ui/FilterBar'
import StateFeedback from '../ui/StateFeedback'
import StatusChip from '../ui/StatusChip'
import ConfirmDialog from '../ui/ConfirmDialog'
import SvoOrderDetails from './SvoOrderDetails'
import SvoOrderResultDialog from './SvoOrderResultDialog'
import { SVO_ALERT_ACTION_SX, SVO_ALERT_STACKED_SX, SVO_FOCUS_SX, SVO_SELECT_FIELD_SX } from './svoOrderStyles'

/** A página configura a operação ou a consulta; a API fornece as ações efetivamente autorizadas. */
interface SvoOrderListProps { api: ApiRequest; operational: boolean }

const FILTER_OPTIONS = [
  { value: 'ACTIVE', label: 'Ativas' },
  ...SVO_ORDER_STATUSES.map((value) => ({ value, label: SVO_ORDER_LABELS[value] })),
]

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
      : <StateFeedback kind="error" title="Não foi possível carregar as ordens." description={state.listError} actionLabel="Tentar novamente" sx={SVO_ALERT_STACKED_SX} actionSx={SVO_ALERT_ACTION_SX} onAction={() => { void state.reload() }} />
    if (state.orders.length === 0) return <StateFeedback kind="empty"
      title={state.filter === 'ACTIVE' ? (operational ? 'Nenhuma ordem ativa para sua equipe' : 'Nenhuma ordem ativa disponível')
        : state.filter ? 'Nenhuma ordem encontrada para esta situação' : operational ? 'Nenhuma ordem disponível para sua equipe' : 'Nenhuma ordem disponível'}
      actionLabel={state.filter ? 'Limpar filtro' : 'Atualizar'} sx={SVO_ALERT_STACKED_SX} actionSx={SVO_ALERT_ACTION_SX} onAction={() => { if (state.filter) state.changeFilter(''); else void state.reload() }} />
    return <Box sx={{
      display: 'grid',
      gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' },
      alignItems: 'stretch',
      gap: 2,
      '& > article': { display: 'flex', flexDirection: 'column', height: '100%', mb: 0 },
      '& > article .MuiCardActions-root': { mt: 'auto' },
    }}>
      {state.orders.map((order) => <OrderCard key={order.id} order={order} operational={operational}
        disabled={busy || state.loading || state.stale || Boolean(state.uncertainId)}
        onDetail={(trigger) => { triggerRef.current = trigger; void state.openDetail(order.id) }}
        onAction={(action, trigger) => { triggerRef.current = trigger; state.openAction(order, action) }}
        onResult={(trigger) => { triggerRef.current = trigger; state.openResult(order) }} />)}
    </Box>
  }

  return <Box sx={{ width: '100%', minWidth: 0, overflowWrap: 'anywhere', ...SVO_FOCUS_SX,
    '& .MuiChip-root': { height: 'auto', minHeight: 26, maxWidth: '100%' },
    '& .MuiChip-label': { whiteSpace: 'normal', py: 0.5 } }}>
    <PageHeader title={title}
      description={operational ? 'Consulte suas ordens, confirme saída e chegada e registre o resultado do atendimento.' : 'Consulte as ordens e atualize a lista para acompanhar a equipe.'}
    />
    <FilterBar label="Filtros das ordens">
      <Box sx={{ flex: '1 1 240px', minWidth: { xs: '100%', sm: 210 } }}>
        <FormSelect label="Situação" value={state.filter} emptyLabel="Todas" displayEmpty options={FILTER_OPTIONS}
          sx={SVO_SELECT_FIELD_SX}
          disabled={busy} onChange={(value) => { if (value === '' || value === 'ACTIVE' || SVO_ORDER_STATUSES.some((status) => status === value)) state.changeFilter(value as typeof state.filter) }} />
      </Box>
      <Button variant="contained" sx={{ minHeight: 44, minWidth: 44 }} disabled={state.loading || busy} onClick={() => { void state.reload() }}>
        {state.loading && state.orders !== null ? 'Atualizando...' : 'Atualizar'}
      </Button>
    </FilterBar>
    <Box ref={resultRef} role="status" aria-live="polite" tabIndex={-1}>
      {state.result && <Alert severity="success" role="presentation" sx={{ mb: 2 }}>{state.result}</Alert>}
    </Box>
    {state.orders !== null && state.stale && <StateFeedback kind="partial" title="A lista pode estar desatualizada."
      description={state.listError} actionLabel="Atualizar consulta" sx={SVO_ALERT_STACKED_SX} actionSx={SVO_ALERT_ACTION_SX} onAction={() => { void state.reload() }} />}
    {state.uncertainId && !state.draft && !state.resultDraft && <StateFeedback kind="partial" title={`O resultado da ordem #${state.uncertainId} é incerto.`}
      description="Consulte a situação antes de escolher uma nova ação." actionLabel="Consultar situação" sx={SVO_ALERT_STACKED_SX} actionSx={SVO_ALERT_ACTION_SX} onAction={() => { void state.reconcile() }} />}
    <Box component="section" aria-labelledby={headingId} aria-busy={state.loading}>
      <Stack direction="row" sx={{ mb: 2, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
        <Typography ref={listHeadingRef} id={headingId} component="h2" variant="h6" tabIndex={-1} sx={{ fontWeight: 700 }}>
          Ordens {state.filter === 'ACTIVE' ? '— Ativas' : state.filter ? `— ${SVO_ORDER_LABELS[state.filter]}` : '— Todas'}
        </Typography>
        {state.orders && <Typography variant="body2" color="text.secondary">{state.orders.length} {state.orders.length === 1 ? 'ordem' : 'ordens'}</Typography>}
      </Stack>
      {content()}
    </Box>
    {detail && <SvoOrderDetails id={detail.id} order={detail.data} loading={detail.loading} error={detail.error}
      onRetry={() => { void state.openDetail(detail.id) }} onClose={state.closeDetail} />}
    {draft && <ConfirmDialog open title={SVO_ACTION_LABELS[draft.action]} sx={SVO_FOCUS_SX}
      description={<>{orderConfirmation(draft.order.id, draft.action)}<Typography sx={{ mt: 1 }}>Local do despacho: {draft.order.dispatch.location ?? MISSING_DISPATCH}</Typography></>}
      confirmLabel={SVO_ACTION_LABELS[draft.action]} cancelLabel="Voltar" loading={state.submitting}
      confirmDisabled={draft.blocked || state.loading || state.stale || Boolean(state.uncertainId)}
      onConfirm={() => { void state.submit() }} onCancel={state.closeAction} autoFocusCancel>
      {draft.error && <Alert severity="error" sx={{ mt: 2 }}>{draft.error}</Alert>}
      {draft.blocked && !state.uncertainId && <Typography sx={{ mt: 1 }}>Volte à lista atualizada e escolha novamente a ação disponível.</Typography>}
      {state.uncertainId && <Button color="inherit" disabled={busy} sx={{ mt: 1, minHeight: 44 }} onClick={() => { void state.reconcile() }}>{state.reconciling ? 'Consultando...' : 'Consultar situação'}</Button>}
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
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
        <OrderFactGroup title="No despacho">
          <OrderFact label="Local" value={order.dispatch.location ?? MISSING_DISPATCH} />
          <OrderFact label="Equipe" value={order.dispatch.teamName ?? MISSING_DISPATCH} />
          <OrderFact label="Veículo" value={order.dispatch.vehicleLicensePlate ?? MISSING_DISPATCH} />
          {(['location', 'teamName', 'vehicleLicensePlate'] as const).some((key) => order.dispatch[key] === null)
            && <Typography variant="caption" color="text.secondary">Informação histórica parcialmente indisponível.</Typography>}
        </OrderFactGroup>
        <OrderFactGroup title="Andamento">
          <OrderFact label="Aberta em" value={formatDateTime(order.openedAt)} />
          {order.departedAt && <OrderFact label="Saída" value={formatDateTime(order.departedAt)} />}
          {order.arrivedAt && <OrderFact label="Chegada" value={formatDateTime(order.arrivedAt)} />}
          {order.collectedAt && <OrderFact label="Coleta" value={formatDateTime(order.collectedAt)} />}
          {order.closedAt && <OrderFact label="Encerrada em" value={formatDateTime(order.closedAt)} />}
          {(order.result !== null || order.status === 'COMPLETED' || order.status === 'NOT_PERFORMED')
            && <OrderFact label="Resultado" value={order.result ? SVO_ORDER_LABELS[order.result] : MISSING_RECORD} />}
        </OrderFactGroup>
        {(order.dispatch.location !== order.current.location || order.dispatch.teamName !== order.current.teamName
          || order.dispatch.vehicleLicensePlate !== order.current.vehicleLicensePlate) && (
          <OrderFactGroup title="Cadastro atual">
            {order.dispatch.location !== order.current.location && <OrderFact label="Local" value={order.current.location} />}
            {order.dispatch.teamName !== order.current.teamName && <OrderFact label="Equipe" value={order.current.teamName} />}
            {order.dispatch.vehicleLicensePlate !== order.current.vehicleLicensePlate && <OrderFact label="Veículo" value={order.current.vehicleLicensePlate} />}
          </OrderFactGroup>
        )}
      </Box>
    </EntityCard.Body>
    <EntityCard.Actions>
      <Button variant="outlined" aria-label={`Ver detalhes da ordem #${order.id}`} onClick={(event) => onDetail(event.currentTarget)}>Ver detalhes</Button>
      {operational && order.allowedTransitions.map((action) => <Button key={action} variant="contained" disabled={disabled}
        aria-label={`${SVO_ACTION_LABELS[action]} da ordem #${order.id}`} onClick={(event) => onAction(action, event.currentTarget)}>{SVO_ACTION_LABELS[action]}</Button>)}
      {operational && order.allowedResults.length > 0 && <Button variant="contained" disabled={disabled}
        aria-label={`Encerrar ordem #${order.id}`} onClick={(event) => onResult(event.currentTarget)}>Encerrar</Button>}
    </EntityCard.Actions>
  </EntityCard>
}

function OrderFactGroup({ title, children }: { title: string; children: ReactNode }) {
  return <Box component="section" aria-label={title} sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: 'background.default' }}>
    <Typography component="h4" variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>{title}</Typography>
    <Stack spacing={0.75}>{children}</Stack>
  </Box>
}

function OrderFact({ label, value }: { label: string; value: string }) {
  return <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(82px, auto) minmax(0, 1fr)', columnGap: 1 }}>
    <Typography variant="body2" color="text.secondary">{label}</Typography>
    <Typography variant="body2" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{value}</Typography>
  </Box>
}
