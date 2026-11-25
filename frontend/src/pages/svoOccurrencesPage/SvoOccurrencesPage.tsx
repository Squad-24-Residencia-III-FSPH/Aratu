import { useEffect, useId, useMemo, useRef } from 'react'
import { Alert, Box, Button, Stack, Typography } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined'
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'
import { resolveProfile } from '../../auth/profiles'
import { tokenUserId } from '../../auth/token'
import { useAuth } from '../../auth/useAuth'
import { accessibleControls } from '../../components/ui/accessibleControls'
import DataTable from '../../components/ui/DataTable'
import type { DataTableColumn } from '../../components/ui/DataTable'
import { EntityCard } from '../../components/ui/EntityCard'
import FilterBar from '../../components/ui/FilterBar'
import { FormField, FormSelect } from '../../components/ui/FormField'
import PageHeader from '../../components/ui/PageHeader'
import StateFeedback from '../../components/ui/StateFeedback'
import StatusChip from '../../components/ui/StatusChip'
import { useSvoOccurrences } from '../../hooks/useSvoOccurrences'
import {
  canManageSvoDispatch,
  canReadSvoOccurrences,
  canWriteSvoOccurrences,
  isAwaitingSvoDispatch,
  SVO_DISPATCH_ORDER_STATUS_LABELS,
  SVO_OCCURRENCE_STATUS_LABELS,
  SVO_OCCURRENCE_STATUS_TONES,
  SVO_OCCURRENCE_STATUSES,
  SVO_REQUESTER_TYPE_LABELS,
} from '../../types/svoOccurrence'
import type { SvoOccurrenceStatus, SvoOccurrenceSummary } from '../../types/svoOccurrence'
import { formatDateTime } from '../../utils/dates'
import SvoOccurrenceConfirmDialog from './SvoOccurrenceConfirmDialog'
import SvoOccurrenceCreateDialog from './SvoOccurrenceCreateDialog'
import SvoOccurrenceDetailsDialog from './SvoOccurrenceDetailsDialog'
import SvoOrderDispatchDialog from './SvoOrderDispatchDialog'

const STATUS_OPTIONS = SVO_OCCURRENCE_STATUSES.map((value) => ({
  value,
  label: SVO_OCCURRENCE_STATUS_LABELS[value],
}))

/**
 * Tela operacional da Central SVO para registro, triagem, confirmação e despacho
 * de solicitações (`FROTA-109` e `FROTA-116`).
 */
export default function SvoOccurrencesPage() {
  const { api, session } = useAuth()
  const profile = session ? resolveProfile(session.perfil) : null
  const canRead = canReadSvoOccurrences(profile)
  const canWrite = canWriteSvoOccurrences(profile)
  const sessionKey = session ? `${tokenUserId(session.token)}:${profile}` : 'anonymous'

  return (
    <SvoOccurrencesView
      key={sessionKey}
      api={api}
      canRead={canRead}
      canWrite={canWrite}
      canDispatch={canManageSvoDispatch(profile)}
    />
  )
}

interface SvoOccurrencesViewProps {
  api: ReturnType<typeof useAuth>['api']
  canRead: boolean
  canWrite: boolean
  canDispatch: boolean
}

function SvoOccurrencesView({ api, canRead, canWrite, canDispatch }: SvoOccurrencesViewProps) {
  const state = useSvoOccurrences(api, canRead)
  const sectionHeadingId = useId()
  const queueHeadingId = useId()
  const resultRef = useRef<HTMLDivElement>(null)
  const listHeadingRef = useRef<HTMLHeadingElement>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const hasOpenDialog = Boolean(state.detail || state.createDraft || state.confirmState || state.dispatchDraft)

  useEffect(() => {
    const previousTitle = document.title
    document.title = 'Solicitações SVO — Aratu'
    return () => {
      document.title = previousTitle
    }
  }, [])

  // Devolve o foco ao acionador quando possível; se o botão sumir após mudança de estado, foca o anúncio ou título.
  useEffect(() => {
    if (hasOpenDialog || !triggerRef.current) return
    const frame = requestAnimationFrame(() => {
      if (triggerRef.current?.isConnected && !triggerRef.current.disabled) {
        triggerRef.current.focus()
      } else if (state.result) {
        resultRef.current?.focus()
      } else {
        listHeadingRef.current?.focus()
      }
      triggerRef.current = null
    })
    return () => cancelAnimationFrame(frame)
  }, [hasOpenDialog, state.result])

  const columns: readonly DataTableColumn<SvoOccurrenceSummary>[] = useMemo(() => [
    { key: 'id', header: 'ID', render: (row) => <strong>#{row.id}</strong> },
    {
      key: 'requesterType',
      header: 'Tipo de solicitante',
      render: (row) => SVO_REQUESTER_TYPE_LABELS[row.requesterType],
    },
    { key: 'location', header: 'Local', render: (row) => row.location },
    {
      key: 'receivedAt',
      header: 'Recebimento (Maceió)',
      render: (row) => formatDateTime(row.receivedAt),
    },
    {
      key: 'createdAt',
      header: 'Cadastro',
      render: (row) => formatDateTime(row.createdAt),
    },
    {
      key: 'status',
      header: 'Situação',
      render: (row) => {
        const linkedOrder = state.ordersByOccurrenceId.get(row.id)
        return (
          <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <StatusChip
              label={SVO_OCCURRENCE_STATUS_LABELS[row.status]}
              tone={SVO_OCCURRENCE_STATUS_TONES[row.status]}
            />
            {linkedOrder && (
              <Typography variant="caption" color="text.secondary">
                Ordem #{linkedOrder.id} ({SVO_DISPATCH_ORDER_STATUS_LABELS[linkedOrder.status] ?? linkedOrder.status})
              </Typography>
            )}
          </Stack>
        )
      },
    },
  ], [state.ordersByOccurrenceId])

  if (!canRead || state.forbidden) {
    return (
      <Box sx={{ maxWidth: 1120, minWidth: 0, ...accessibleControls }}>
        <PageHeader title="Solicitações SVO" />
        <StateFeedback
          kind="forbidden"
          title="Seu perfil atual não tem permissão para consultar solicitações SVO."
          description="O acesso é restrito à Central SVO, ao Gestor e à Administração."
        />
      </Box>
    )
  }

  const hasFilters = Boolean(state.appliedFilters.status || state.appliedFilters.from || state.appliedFilters.to)
  const busy = state.submitting || state.reconciling || state.dispatchingId !== null
  const dispatchQueue = state.occurrences?.filter((occurrence) =>
    isAwaitingSvoDispatch(occurrence) && !state.ordersByOccurrenceId.has(occurrence.id)) ?? []

  return (
    <Box sx={{ maxWidth: 1180, minWidth: 0, overflowWrap: 'anywhere', ...accessibleControls }}>
      <PageHeader
        title="Solicitações SVO"
        description={
          canWrite
            ? 'Registre chamados recebidos fora do sistema e confirme a triagem.'
            : 'Acompanhe os chamados da Central SVO e reavalie os recursos para despacho.'
        }
        actions={
          <>
            <Button
              type="button"
              variant="outlined"
              color="inherit"
              disabled={state.loading || busy}
              onClick={() => { void state.reload() }}
            >
              {state.loading && state.occurrences !== null ? 'Atualizando...' : 'Atualizar'}
            </Button>
            {canWrite && (
              <Button
                type="button"
                variant="contained"
                startIcon={<AddIcon aria-hidden="true" />}
                disabled={busy}
                onClick={(event) => {
                  triggerRef.current = event.currentTarget
                  state.openCreate()
                }}
              >
                Nova solicitação
              </Button>
            )}
          </>
        }
      />

      <Box ref={resultRef} role="status" aria-live="polite" tabIndex={-1}>
        {state.result && <Alert role="none" severity="success" sx={{ mb: 2 }}>{state.result}</Alert>}
      </Box>
      {state.dispatchError && <Alert severity="error" sx={{ mb: 2 }}>{state.dispatchError}</Alert>}
      {state.partialWarning && <StateFeedback kind="partial" title={state.partialWarning} />}

      {state.occurrences !== null && state.stale && (
        <StateFeedback
          kind="partial"
          title="A lista pode estar desatualizada."
          description={state.listError}
          actionLabel="Tentar novamente"
          onAction={() => { void state.reload() }}
        />
      )}

      {state.occurrences !== null && state.ordersSyncWarning && (
        <StateFeedback
          kind="partial"
          title="Vínculo com ordens SVO parcialmente indisponível."
          description={state.ordersSyncWarning}
          actionLabel="Atualizar consulta"
          onAction={() => { void state.reload() }}
        />
      )}

      <FilterBar label="Filtros de solicitações SVO">
        <Box sx={{ minWidth: { xs: '100%', sm: 180 }, flex: { sm: '0 0 auto' } }}>
          <FormSelect
            label="Situação"
            value={state.filterDraft.status}
            emptyLabel="Todas"
            displayEmpty
            disabled={busy}
            options={STATUS_OPTIONS}
            onChange={(value) => state.updateFilterDraft({ status: value as SvoOccurrenceStatus | '' })}
          />
        </Box>
        <Box sx={{ minWidth: { xs: '100%', sm: 170 }, flex: { sm: '0 0 auto' } }}>
          <FormField
            label="Recebidas de"
            type="date"
            value={state.filterDraft.from}
            error={state.filterErrors.from}
            disabled={busy}
            onChange={(value) => state.updateFilterDraft({ from: value })}
          />
        </Box>
        <Box sx={{ minWidth: { xs: '100%', sm: 170 }, flex: { sm: '0 0 auto' } }}>
          <FormField
            label="Até"
            type="date"
            value={state.filterDraft.to}
            error={state.filterErrors.to}
            disabled={busy}
            onChange={(value) => state.updateFilterDraft({ to: value })}
          />
        </Box>
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
          <Button
            type="button"
            variant="contained"
            disabled={state.loading || busy}
            onClick={() => { state.applyFilters() }}
          >
            Filtrar
          </Button>
          <Button
            type="button"
            variant="outlined"
            color="inherit"
            disabled={state.loading || busy}
            onClick={() => { state.clearFilters() }}
          >
            Limpar filtros
          </Button>
        </Stack>
      </FilterBar>

      {canDispatch && state.occurrences !== null && (
        <Stack component="section" aria-labelledby={queueHeadingId} spacing={1.5} sx={{ mb: 3, minWidth: 0 }}>
          <Typography id={queueHeadingId} component="h2" variant="h6">Aguardando despacho</Typography>
          {dispatchQueue.length === 0 && <StateFeedback kind="empty" title="Nenhuma solicitação aguardando despacho neste recorte." />}
          {dispatchQueue.map((occurrence) => (
            <EntityCard key={occurrence.id}>
              <EntityCard.Header title={`Solicitação #${occurrence.id}`} />
              <EntityCard.Body>
                <Typography variant="body2">{occurrence.location}</Typography>
                <Typography variant="body2">
                  {occurrence.dispatchWaitReason === 'NO_TEAM' ? 'Aguardando equipe em plantão elegível.'
                    : occurrence.dispatchWaitReason === 'NO_VEHICLE' ? 'Aguardando viatura com vaga elegível.'
                      : 'Aguardando nova avaliação de recursos.'}
                </Typography>
              </EntityCard.Body>
              <EntityCard.Actions>
                <Button
                  type="button"
                  variant="contained"
                  disabled={busy || state.loading || state.stale}
                  aria-label={`Tentar despacho da solicitação #${occurrence.id}`}
                  aria-busy={state.dispatchingId === occurrence.id || undefined}
                  onClick={async (event) => {
                    const trigger = event.currentTarget
                    const retried = await state.retryDispatch(occurrence)
                    if (retried) requestAnimationFrame(() => {
                      if (!trigger.isConnected && document.activeElement === document.body) resultRef.current?.focus()
                    })
                  }}
                >
                  {state.dispatchingId === occurrence.id ? 'Avaliando...' : 'Tentar despacho'}
                </Button>
              </EntityCard.Actions>
            </EntityCard>
          ))}
        </Stack>
      )}

      <Box component="section" aria-labelledby={sectionHeadingId}>
        <Typography ref={listHeadingRef} id={sectionHeadingId} component="h2" variant="h6" tabIndex={-1} sx={{ mb: 1.5 }}>
          Chamados registrados
        </Typography>

        {state.occurrences === null ? (
          state.loading ? (
            <StateFeedback kind="loading" title="Carregando solicitações SVO..." />
          ) : (
            <StateFeedback
              kind="error"
              title="Não foi possível carregar as solicitações SVO."
              description={state.listError}
              actionLabel="Tentar novamente"
              onAction={() => { void state.reload() }}
            />
          )
        ) : (
          <DataTable
            caption="Solicitações SVO cadastradas"
            columns={columns}
            rows={state.occurrences}
            rowKey={(row) => row.id}
            busy={state.loading}
            minWidth={780}
            loadingContent={<StateFeedback kind="loading" title="Carregando solicitações SVO..." sx={{ py: 3, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 1.5 }} />}
            emptyContent={
              <StateFeedback
                kind="empty"
                centered
                title={hasFilters ? 'Nenhuma solicitação encontrada para os filtros aplicados.' : 'Nenhuma solicitação SVO cadastrada até o momento.'}
                description={hasFilters ? 'Ajuste o período ou limpe os filtros para visualizar todos os chamados.' : undefined}
                actionLabel={hasFilters ? 'Limpar filtros' : canWrite ? 'Nova solicitação' : 'Atualizar'}
                onAction={() => {
                  if (hasFilters) state.clearFilters()
                  else if (canWrite) state.openCreate()
                  else void state.reload()
                }}
              />
            }
            renderActions={(row) => {
              const linkedOrder = state.ordersByOccurrenceId.get(row.id)
              return (
                <Stack direction="row" spacing={1} useFlexGap sx={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <Button
                    type="button"
                    size="small"
                    color="inherit"
                    startIcon={<VisibilityOutlinedIcon aria-hidden="true" />}
                    aria-label={`Ver detalhes da solicitação #${row.id}`}
                    onClick={(event) => {
                      triggerRef.current = event.currentTarget
                      void state.openDetail(row.id)
                    }}
                  >
                    Detalhes
                  </Button>
                  {canWrite && row.status === 'PENDING' && (
                    <Button
                      type="button"
                      size="small"
                      variant="contained"
                      disabled={busy || state.stale}
                      startIcon={<CheckCircleOutlinedIcon aria-hidden="true" />}
                      aria-label={`Confirmar triagem da solicitação #${row.id}`}
                      onClick={(event) => {
                        triggerRef.current = event.currentTarget
                        state.openConfirm(row)
                      }}
                    >
                      Confirmar triagem
                    </Button>
                  )}
                  {canDispatch && isAwaitingSvoDispatch(row) && !linkedOrder && (
                    <Button
                      type="button"
                      size="small"
                      variant="contained"
                      disabled={busy || state.stale}
                      startIcon={<LocalShippingOutlinedIcon aria-hidden="true" />}
                      aria-label={`Gerar ordem para solicitação #${row.id}`}
                      onClick={(event) => {
                        triggerRef.current = event.currentTarget
                        state.openDispatch(row)
                      }}
                    >
                      Gerar ordem
                    </Button>
                  )}
                </Stack>
              )
            }}
          />
        )}
      </Box>

      {state.detail && (
        <SvoOccurrenceDetailsDialog
          detail={state.detail}
          linkedOrder={state.ordersByOccurrenceId.get(state.detail.id)}
          canWrite={canWrite}
          canDispatch={canDispatch && !busy && !state.stale}
          onRetry={() => { void state.openDetail(state.detail!.id) }}
          onClose={state.closeDetail}
          onConfirmOccurrence={(occurrence) => {
            state.closeDetail()
            state.openConfirm(occurrence)
          }}
          onDispatchOrder={(occurrence) => {
            state.closeDetail()
            state.openDispatch(occurrence)
          }}
        />
      )}

      {state.createDraft && (
        <SvoOccurrenceCreateDialog
          draft={state.createDraft}
          submitting={state.submitting}
          reconciling={state.reconciling}
          onChange={state.updateCreateDraft}
          onSubmit={state.submitCreate}
          onReconcile={() => { void state.reconcileCreate() }}
          onClose={state.closeCreate}
        />
      )}

      {state.confirmState && (
        <SvoOccurrenceConfirmDialog
          state={state.confirmState}
          submitting={state.submitting}
          reconciling={state.reconciling}
          onConfirm={() => { void state.submitConfirm() }}
          onReconcile={() => { void state.reconcileConfirm() }}
          onCancel={state.closeConfirm}
        />
      )}

      {state.dispatchDraft && (
        <SvoOrderDispatchDialog
          draft={state.dispatchDraft}
          submitting={state.submitting}
          reconciling={state.reconciling}
          onChange={state.updateDispatchDraft}
          onReloadCandidates={() => { void state.loadDispatchCandidates(state.dispatchDraft!.occurrence.id) }}
          onSubmit={state.submitDispatch}
          onReconcile={() => { void state.reconcileDispatch() }}
          onClose={state.closeDispatch}
        />
      )}
    </Box>
  )
}
