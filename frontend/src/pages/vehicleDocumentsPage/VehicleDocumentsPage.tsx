import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import AddIcon from '@mui/icons-material/Add'
import Autorenew from '@mui/icons-material/Autorenew'
import BlockOutlined from '@mui/icons-material/BlockOutlined'
import EditOutlined from '@mui/icons-material/EditOutlined'
import HistoryOutlined from '@mui/icons-material/HistoryOutlined'
import { Alert, Box, Button, Card, CardActions, CardContent, Paper, Stack, Typography, useMediaQuery, useTheme } from '@mui/material'
import { resolveProfile } from '../../auth/profiles.ts'
import { useAuth } from '../../auth/useAuth.ts'
import { accessibleControls } from '../../components/ui/accessibleControls.ts'
import DataTable from '../../components/ui/DataTable.tsx'
import type { DataTableColumn } from '../../components/ui/DataTable.tsx'
import FilterBar from '../../components/ui/FilterBar.tsx'
import { FormField, FormSelect } from '../../components/ui/FormField.tsx'
import PageHeader from '../../components/ui/PageHeader.tsx'
import StateFeedback from '../../components/ui/StateFeedback.tsx'
import StatusChip from '../../components/ui/StatusChip.tsx'
import { useVehicleDocuments } from '../../hooks/useVehicleDocuments.ts'
import {
  canManageVehicleDocuments,
  formatDaysUntilExpiration,
  parseAlertDaysInput,
  VEHICLE_DOCUMENT_STATUS_LABELS,
  VEHICLE_DOCUMENT_STATUS_TONES,
  VEHICLE_DOCUMENT_STATUSES,
  VEHICLE_DOCUMENT_TYPE_LABELS,
  VEHICLE_DOCUMENT_TYPES,
} from '../../types/vehicleDocument.ts'
import type {
  VehicleDocument,
  VehicleDocumentFilters,
  VehicleDocumentStatus,
  VehicleDocumentType,
} from '../../types/vehicleDocument.ts'
import { formatCalendarDate } from '../../utils/dates.ts'
import VehicleDocumentAnnulDialog from './VehicleDocumentAnnulDialog.tsx'
import VehicleDocumentDetailDialog from './VehicleDocumentDetailDialog.tsx'
import VehicleDocumentFormDialog from './VehicleDocumentFormDialog.tsx'
import type { DocumentFormMode } from './VehicleDocumentFormDialog.tsx'
import {
  buildDocumentsSearchParams,
  parseDocumentsUrlParams,
} from './vehicleDocumentForm.ts'

const TYPE_OPTIONS = VEHICLE_DOCUMENT_TYPES.map((value) => ({
  value,
  label: VEHICLE_DOCUMENT_TYPE_LABELS[value],
}))

const STATUS_OPTIONS = VEHICLE_DOCUMENT_STATUSES.map((value) => ({
  value,
  label: VEHICLE_DOCUMENT_STATUS_LABELS[value],
}))

function buildDocumentColumns(includeExpirationDetails: boolean): readonly DataTableColumn<VehicleDocument>[] {
  return [
    {
      key: 'plate',
      header: 'Placa / Veículo',
      render: (document) => (
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            {document.vehicle.licensePlate}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {document.vehicle.model ?? 'Modelo não informado'}
            {document.vehicle.status === 'INACTIVE' ? ' · Inativo' : ''}
          </Typography>
        </Box>
      ),
    },
    {
      key: 'type',
      header: 'Tipo',
      render: (document) => (
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {VEHICLE_DOCUMENT_TYPE_LABELS[document.documentType]}
          </Typography>
          {document.documentNumber && (
            <Typography variant="caption" color="text.secondary">
              Nº {document.documentNumber}
            </Typography>
          )}
        </Box>
      ),
    },
    ...(includeExpirationDetails
      ? [
          {
            key: 'issuedAt',
            header: 'Emissão',
            render: (document: VehicleDocument) =>
              document.issuedAt ? formatCalendarDate(document.issuedAt) : 'Não informada',
          } satisfies DataTableColumn<VehicleDocument>,
        ]
      : []),
    {
      key: 'expiresAt',
      header: 'Vencimento',
      render: (document) => (
        <Box>
          <Typography
            variant="body2"
            color={document.status === 'EXPIRED' ? 'error.main' : 'text.primary'}
            sx={{ fontWeight: document.status === 'EXPIRED' || document.status === 'EXPIRING' ? 700 : 400 }}
          >
            {formatCalendarDate(document.expiresAt)}
          </Typography>
          <Typography
            variant="caption"
            color={document.status === 'EXPIRED'
              ? 'error.main'
              : document.status === 'EXPIRING'
                ? 'warning.dark'
                : 'text.secondary'}
            sx={{ fontWeight: document.status === 'EXPIRED' || document.status === 'EXPIRING' ? 700 : 400 }}
          >
            {formatDaysUntilExpiration(document.daysUntilExpiration, document.status)}
          </Typography>
        </Box>
      ),
    },
    {
      key: 'status',
      header: 'Situação',
      render: (document) => (
        <StatusChip
          label={VEHICLE_DOCUMENT_STATUS_LABELS[document.status]}
          tone={VEHICLE_DOCUMENT_STATUS_TONES[document.status]}
        />
      ),
    },
  ]
}

const ALERT_COLUMNS = buildDocumentColumns(false)
const LIST_COLUMNS = buildDocumentColumns(true)

/**
 * Tela de gestão de documentos de veículos e alertas de vencimento (FROTA-70).
 *
 * Consome `/vehicle-documents`, `/vehicle-documents/expiring` e `/vehicle-documents/:id`,
 * sincronizando filtros e janela do alerta com os parâmetros de busca da URL.
 */
export function VehicleDocumentsPage() {
  const { api, session } = useAuth()
  const profile = session ? resolveProfile(session.perfil) : null
  const allowed = canManageVehicleDocuments(profile)
  const theme = useTheme()
  const smallScreen = useMediaQuery(theme.breakpoints.down('sm'))

  const [searchParams, setSearchParams] = useSearchParams()
  const urlState = useMemo(() => parseDocumentsUrlParams(searchParams), [searchParams])
  const filters = urlState.filters
  const alertDays = urlState.alertDays

  const [daysDraft, setDaysDraft] = useState<string | null>(null)
  const [daysDraftError, setDaysDraftError] = useState('')
  const daysInput = daysDraft ?? urlState.alertDaysInput
  const daysError = daysDraft !== null ? daysDraftError : urlState.alertDaysError

  const [formDialog, setFormDialog] = useState<
    | { mode: 'create' }
    | { mode: 'edit'; document: VehicleDocument }
    | { mode: 'renew'; document: VehicleDocument }
    | null
  >(null)
  const [annulTarget, setAnnulTarget] = useState<VehicleDocument | null>(null)
  const [feedback, setFeedback] = useState<{ severity: 'success' | 'warning'; message: string } | null>(null)
  const feedbackRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previous = document.title
    document.title = 'Documentos de Veículos — Aratu'
    return () => { document.title = previous }
  }, [])

  const state = useVehicleDocuments(api, filters, alertDays, allowed)

  const vehicleOptions = useMemo(
    () =>
      state.vehicles.map((vehicle) => ({
        value: vehicle.id,
        label: `${vehicle.licensePlate}${vehicle.model ? ` — ${vehicle.model}` : ''}${vehicle.status === 'INACTIVE' ? ' (Inativo)' : ''}`,
      })),
    [state.vehicles],
  )

  const referenceDate = state.expiringData?.referenceDate ?? state.listData?.referenceDate
  const effectiveAlertDays = state.expiringData?.alertDays ?? state.listData?.alertDays

  const expiredAlertCount = useMemo(
    () => (state.expiringData?.items ?? []).filter((item) => item.status === 'EXPIRED').length,
    [state.expiringData],
  )
  const expiringAlertCount = useMemo(
    () => (state.expiringData?.items ?? []).filter((item) => item.status === 'EXPIRING').length,
    [state.expiringData],
  )

  function syncUrl(nextFilters: VehicleDocumentFilters, nextAlertDays: number | undefined) {
    setSearchParams(buildDocumentsSearchParams(nextFilters, nextAlertDays), { replace: true })
  }

  function updateFilters(patch: Partial<VehicleDocumentFilters>) {
    const next: VehicleDocumentFilters = {
      ...filters,
      ...patch,
    }
    if (!next.vehicleId) delete next.vehicleId
    if (!next.documentType) delete next.documentType
    if (!next.status) delete next.status
    syncUrl(next, alertDays)
  }

  function clearAllFilters() {
    syncUrl({}, alertDays)
  }

  function applyAlertWindow() {
    const parsed = parseAlertDaysInput(daysInput)
    if (parsed.error) {
      setDaysDraft(daysInput)
      setDaysDraftError(parsed.error)
      return
    }
    setDaysDraft(null)
    setDaysDraftError('')
    syncUrl(filters, parsed.days)
  }

  function resetAlertWindow() {
    setDaysDraft(null)
    setDaysDraftError('')
    syncUrl(filters, undefined)
  }

  function announceSuccess(message: string) {
    setFeedback({ severity: 'success', message })
    requestAnimationFrame(() => feedbackRef.current?.focus())
  }

  function handleSaved(saved: VehicleDocument, mode: DocumentFormMode) {
    setFormDialog(null)
    const typeLabel = VEHICLE_DOCUMENT_TYPE_LABELS[saved.documentType]
    const message = mode === 'edit'
      ? `Documento #${saved.id} (${typeLabel} · ${saved.vehicle.licensePlate}) corrigido com sucesso.`
      : mode === 'renew'
        ? `Renovação #${saved.id} (${typeLabel} · ${saved.vehicle.licensePlate}) registrada com sucesso.`
        : `Documento #${saved.id} (${typeLabel} · ${saved.vehicle.licensePlate}) cadastrado com sucesso.`
    announceSuccess(message)
    state.reloadList()
    state.reloadExpiring()
    if (state.selection?.id === saved.id) {
      void state.openDetail(saved.id)
    }
  }

  function handleAnnulled(annulled: VehicleDocument) {
    setAnnulTarget(null)
    announceSuccess(
      `Documento #${annulled.id} (${VEHICLE_DOCUMENT_TYPE_LABELS[annulled.documentType]} · ${annulled.vehicle.licensePlate}) anulado com preservação histórica.`,
    )
    state.reloadList()
    state.reloadExpiring()
    if (state.selection?.id === annulled.id) {
      void state.openDetail(annulled.id)
    }
  }

  function handleConflictReload(documentId: string) {
    setFormDialog(null)
    setAnnulTarget(null)
    setFeedback({
      severity: 'warning',
      message: 'Os dados do documento foram recarregados após alteração concorrente.',
    })
    state.reloadList()
    state.reloadExpiring()
    void state.openDetail(documentId)
  }

  const filtersActive = Boolean(filters.vehicleId || filters.documentType || filters.status)
  const accessDenied = !allowed || state.forbidden

  return (
    <Box sx={{ minWidth: 0, ...accessibleControls }}>
      <PageHeader
        title="Documentos de Veículos"
        titleVariant="h4"
        breadcrumbs={['Início', 'Documentos de Veículos']}
        description="Gerencie CRLV, licenciamento, IPVA, seguro e contratos da frota com controle de vencimentos e histórico de renovações."
        actions={!accessDenied
          ? (
              <Button
                variant="contained"
                startIcon={<AddIcon aria-hidden="true" />}
                onClick={() => setFormDialog({ mode: 'create' })}
                sx={{ minHeight: 44 }}
              >
                Cadastrar documento
              </Button>
            )
          : undefined}
      />

      {accessDenied && (
        <StateFeedback
          kind="forbidden"
          title="Acesso restrito"
          description="Seu perfil não tem permissão para consultar ou gerenciar documentos de veículos."
        />
      )}

      {!accessDenied && (
        <Stack spacing={3}>
          <Box ref={feedbackRef} role="status" aria-live="polite" tabIndex={-1}>
            {feedback && (
              <Alert severity={feedback.severity} onClose={() => setFeedback(null)}>
                {feedback.message}
              </Alert>
            )}
          </Box>

          <Paper
            component="section"
            aria-labelledby="expiring-alerts-heading"
            variant="outlined"
            sx={{ p: 2.5, borderRadius: 2 }}
          >
            <Stack
              direction={{ xs: 'column', lg: 'row' }}
              spacing={2}
              sx={{ justifyContent: 'space-between', alignItems: { lg: 'flex-start' }, mb: 2 }}
            >
              <Box>
                <Typography id="expiring-alerts-heading" component="h2" variant="h6" sx={{ fontWeight: 700 }}>
                  Alertas de vencimento
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  {referenceDate && effectiveAlertDays !== undefined
                    ? `Data de referência FSPH: ${formatCalendarDate(referenceDate)} · Janela atual: ${effectiveAlertDays} dia(s) · Veículos inativos excluídos do alerta.`
                    : 'Documentos vencidos ou próximos do vencimento para veículos ativos.'}
                </Typography>
              </Box>

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'flex-start' } }}>
                <Box sx={{ width: { xs: '100%', sm: 210 } }}>
                  <FormField
                    label="Janela do alerta (dias)"
                    value={daysInput}
                    onChange={(value) => {
                      setDaysDraft(value)
                      if (daysDraftError) setDaysDraftError('')
                    }}
                    error={daysError || undefined}
                    inputMode="numeric"
                    placeholder={effectiveAlertDays ? String(effectiveAlertDays) : '30'}
                    helperText="Inteiro de 1 a 365 dias."
                  />
                </Box>
                <Button
                  variant="outlined"
                  onClick={applyAlertWindow}
                  sx={{ minHeight: 44 }}
                >
                  Aplicar janela
                </Button>
                {alertDays !== undefined && (
                  <Button
                    color="inherit"
                    onClick={resetAlertWindow}
                    sx={{ minHeight: 44 }}
                  >
                    Usar padrão
                  </Button>
                )}
              </Stack>
            </Stack>

            {state.expiringLoading && state.expiringData === null && (
              <StateFeedback kind="loading" title="Carregando alertas de vencimento..." />
            )}

            {!state.expiringLoading && state.expiringError && state.expiringData === null && (
              <StateFeedback
                kind={state.listData ? 'partial' : 'error'}
                title="Não foi possível carregar os alertas de vencimento."
                description={state.expiringError}
                actionLabel="Tentar novamente"
                onAction={state.reloadExpiring}
              />
            )}

            {state.expiringStale && (
              <StateFeedback
                kind="partial"
                title="Os alertas exibidos podem estar desatualizados."
                description={state.expiringError}
                actionLabel="Tentar novamente"
                onAction={state.reloadExpiring}
              />
            )}

            {state.expiringData && (
              <Stack spacing={2}>
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={1.5}
                  sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between', flexWrap: 'wrap' }}
                >
                  <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap' }} useFlexGap>
                    <Paper variant="outlined" sx={{ px: 2, py: 1.25, borderRadius: 1.5 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        Documentos vencidos
                      </Typography>
                      <Typography variant="h6" color={expiredAlertCount > 0 ? 'error.main' : 'text.primary'} sx={{ fontWeight: 700 }}>
                        {expiredAlertCount} {expiredAlertCount === 1 ? 'documento' : 'documentos'}
                      </Typography>
                    </Paper>
                    <Paper variant="outlined" sx={{ px: 2, py: 1.25, borderRadius: 1.5 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        A vencer em até {state.expiringData.alertDays} dia(s)
                      </Typography>
                      <Typography variant="h6" color={expiringAlertCount > 0 ? 'warning.dark' : 'text.primary'} sx={{ fontWeight: 700 }}>
                        {expiringAlertCount} {expiringAlertCount === 1 ? 'documento' : 'documentos'}
                      </Typography>
                    </Paper>
                  </Stack>

                  <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }} useFlexGap>
                    <Button
                      size="small"
                      variant={filters.status === 'EXPIRED' ? 'contained' : 'outlined'}
                      onClick={() => updateFilters({ status: filters.status === 'EXPIRED' ? undefined : 'EXPIRED' })}
                      sx={{ minHeight: 44 }}
                    >
                      Filtrar vencidos
                    </Button>
                    <Button
                      size="small"
                      variant={filters.status === 'EXPIRING' ? 'contained' : 'outlined'}
                      onClick={() => updateFilters({ status: filters.status === 'EXPIRING' ? undefined : 'EXPIRING' })}
                      sx={{ minHeight: 44 }}
                    >
                      Filtrar a vencer
                    </Button>
                  </Stack>
                </Stack>

                {state.expiringData.items.length === 0 ? (
                  <Alert severity="success" role="status">
                    Nenhum documento vencido ou a vencer nos próximos {state.expiringData.alertDays} dias.
                  </Alert>
                ) : smallScreen ? (
                  <Stack spacing={1.5}>
                    {state.expiringData.items.map((document) => {
                      const labelTarget = `${VEHICLE_DOCUMENT_TYPE_LABELS[document.documentType]} do veículo ${document.vehicle.licensePlate}`
                      return (
                        <Card key={`alert-${document.id}`} variant="outlined">
                          <CardContent>
                            <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 1, alignItems: 'flex-start' }}>
                              <Box>
                                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{document.vehicle.licensePlate}</Typography>
                                <Typography variant="body2" color="text.secondary">
                                  {VEHICLE_DOCUMENT_TYPE_LABELS[document.documentType]} · vence {formatCalendarDate(document.expiresAt)}
                                </Typography>
                              </Box>
                              <StatusChip
                                label={VEHICLE_DOCUMENT_STATUS_LABELS[document.status]}
                                tone={VEHICLE_DOCUMENT_STATUS_TONES[document.status]}
                              />
                            </Stack>
                            <Typography variant="body2" sx={{ mt: 1 }}>
                              {formatDaysUntilExpiration(document.daysUntilExpiration, document.status)}
                            </Typography>
                          </CardContent>
                          <CardActions sx={{ px: 2, pb: 2, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1 }}>
                            <Button
                              variant="outlined"
                              onClick={() => { void state.openDetail(document.id) }}
                              aria-label={`Ver detalhes do documento ${labelTarget}`}
                              startIcon={<HistoryOutlined aria-hidden="true" />}
                              sx={{ minHeight: 44 }}
                            >
                              Ver detalhes
                            </Button>
                            {!document.isAnnulled && document.supersededById === null && (
                              <Button
                                variant="contained"
                                onClick={() => setFormDialog({ mode: 'renew', document })}
                                aria-label={`Renovar documento ${labelTarget}`}
                                startIcon={<Autorenew aria-hidden="true" />}
                                sx={{ minHeight: 44 }}
                              >
                                Renovar
                              </Button>
                            )}
                          </CardActions>
                        </Card>
                      )
                    })}
                  </Stack>
                ) : (
                  <DataTable
                    caption={`Alertas de vencimento para os próximos ${state.expiringData.alertDays} dias`}
                    columns={ALERT_COLUMNS}
                    rows={state.expiringData.items}
                    rowKey={(document) => `alert-${document.id}`}
                    busy={state.expiringLoading}
                    minWidth={760}
                    renderActions={(document) => (
                      <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => { void state.openDetail(document.id) }}
                          aria-label={`Ver detalhes do documento ${VEHICLE_DOCUMENT_TYPE_LABELS[document.documentType]} do veículo ${document.vehicle.licensePlate}`}
                          sx={{ minHeight: 44 }}
                        >
                          Ver detalhes
                        </Button>
                        {!document.isAnnulled && document.supersededById === null && (
                          <Button
                            size="small"
                            variant="contained"
                            onClick={() => setFormDialog({ mode: 'renew', document })}
                            aria-label={`Renovar documento ${VEHICLE_DOCUMENT_TYPE_LABELS[document.documentType]} do veículo ${document.vehicle.licensePlate}`}
                            sx={{ minHeight: 44 }}
                          >
                            Renovar
                          </Button>
                        )}
                      </Stack>
                    )}
                  />
                )}
              </Stack>
            )}
          </Paper>

          <Box component="section" aria-labelledby="documents-list-heading">
            <Typography id="documents-list-heading" component="h2" variant="h6" sx={{ fontWeight: 700, mb: 1.5 }}>
              Todos os documentos
            </Typography>

            <FilterBar label="Filtros de documentos de veículos">
              <Box sx={{ flex: '1 1 220px', minWidth: { xs: '100%', sm: 220 } }}>
                <FormSelect
                  label="Veículo"
                  value={filters.vehicleId ?? ''}
                  onChange={(value) => updateFilters({ vehicleId: value || undefined })}
                  options={vehicleOptions}
                  emptyLabel="Todos os veículos"
                  displayEmpty
                />
              </Box>
              <Box sx={{ flex: '1 1 190px', minWidth: { xs: '100%', sm: 190 } }}>
                <FormSelect
                  label="Tipo"
                  value={filters.documentType ?? ''}
                  onChange={(value) => updateFilters({ documentType: (value || undefined) as VehicleDocumentType | undefined })}
                  options={TYPE_OPTIONS}
                  emptyLabel="Todos os tipos"
                  displayEmpty
                />
              </Box>
              <Box sx={{ flex: '1 1 190px', minWidth: { xs: '100%', sm: 190 } }}>
                <FormSelect
                  label="Situação"
                  value={filters.status ?? ''}
                  onChange={(value) => updateFilters({ status: (value || undefined) as VehicleDocumentStatus | undefined })}
                  options={STATUS_OPTIONS}
                  emptyLabel="Todas as situações"
                  displayEmpty
                />
              </Box>
              <Button
                variant="outlined"
                onClick={clearAllFilters}
                disabled={!filtersActive}
                sx={{ minHeight: 44 }}
              >
                Limpar filtros
              </Button>
              <Button
                onClick={() => {
                  state.reloadList()
                  state.reloadExpiring()
                }}
                sx={{ minHeight: 44 }}
              >
                Atualizar
              </Button>
            </FilterBar>

            {state.vehiclesError && (
              <StateFeedback
                kind="partial"
                title="Não foi possível carregar o catálogo completo de veículos para filtro."
                description={state.vehiclesError}
                actionLabel="Tentar novamente"
                onAction={state.reloadVehicles}
              />
            )}

            {state.listLoading && state.listData === null && (
              <StateFeedback kind="loading" title="Carregando documentos de veículos..." />
            )}

            {!state.listLoading && state.listError && state.listData === null && (
              <StateFeedback
                kind="error"
                title="Não foi possível carregar os documentos."
                description={state.listError}
                actionLabel="Tentar novamente"
                onAction={state.reloadList}
              />
            )}

            {state.listStale && (
              <StateFeedback
                kind="partial"
                title="A lista exibida pode estar desatualizada."
                description={state.listError}
                actionLabel="Tentar novamente"
                onAction={state.reloadList}
              />
            )}

            {state.listLoading && state.listData !== null && (
              <Box role="status" aria-live="polite" sx={{ mb: 2 }}>
                Atualizando documentos...
              </Box>
            )}

            {state.listData && state.listData.items.length === 0 && !state.listLoading && (
              <StateFeedback
                kind="empty"
                title={filtersActive
                  ? 'Nenhum documento encontrado com os filtros selecionados.'
                  : 'Nenhum documento cadastrado.'}
                description={filtersActive
                  ? 'Ajuste ou limpe os filtros para consultar outros registros.'
                  : 'Cadastre o primeiro documento para acompanhar os vencimentos da frota.'}
                actionLabel={filtersActive ? 'Limpar filtros' : 'Cadastrar documento'}
                onAction={filtersActive ? clearAllFilters : () => setFormDialog({ mode: 'create' })}
              />
            )}

            {state.listData && state.listData.items.length > 0 && (
              <>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                  {state.listData.items.length}{' '}
                  {state.listData.items.length === 1 ? 'documento encontrado' : 'documentos encontrados'}
                  {` · Referência: ${formatCalendarDate(state.listData.referenceDate)} (janela padrão ${state.listData.alertDays} dias)`}
                </Typography>

                {smallScreen ? (
                  <Stack spacing={1.5}>
                    {state.listData.items.map((document) => {
                      const labelTarget = `${VEHICLE_DOCUMENT_TYPE_LABELS[document.documentType]} do veículo ${document.vehicle.licensePlate}`
                      const canRenewOrAnnul = !document.isAnnulled && document.supersededById === null
                      return (
                        <Card key={document.id} variant="outlined">
                          <CardContent>
                            <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 1, alignItems: 'flex-start' }}>
                              <Box>
                                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{document.vehicle.licensePlate}</Typography>
                                <Typography variant="body2" color="text.secondary">
                                  {VEHICLE_DOCUMENT_TYPE_LABELS[document.documentType]} · vence {formatCalendarDate(document.expiresAt)}
                                </Typography>
                              </Box>
                              <StatusChip
                                label={VEHICLE_DOCUMENT_STATUS_LABELS[document.status]}
                                tone={VEHICLE_DOCUMENT_STATUS_TONES[document.status]}
                              />
                            </Stack>
                            <Typography variant="body2" sx={{ mt: 1 }}>
                              Número: {document.documentNumber || 'Não informado'} · revisão {document.revision}
                            </Typography>
                          </CardContent>
                          <CardActions sx={{ px: 2, pb: 2, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1 }}>
                            <Button
                              variant="outlined"
                              onClick={() => { void state.openDetail(document.id) }}
                              aria-label={`Ver detalhes do documento ${labelTarget}`}
                              startIcon={<HistoryOutlined aria-hidden="true" />}
                              sx={{ minHeight: 48 }}
                            >
                              Ver detalhes
                            </Button>
                            {canRenewOrAnnul && (
                              <Button
                                onClick={() => setFormDialog({ mode: 'renew', document })}
                                aria-label={`Renovar documento ${labelTarget}`}
                                startIcon={<Autorenew aria-hidden="true" />}
                                sx={{ minHeight: 48 }}
                              >
                                Renovar
                              </Button>
                            )}
                            {!document.isAnnulled && (
                              <Button
                                onClick={() => setFormDialog({ mode: 'edit', document })}
                                aria-label={`Corrigir documento ${labelTarget}`}
                                startIcon={<EditOutlined aria-hidden="true" />}
                                sx={{ minHeight: 48 }}
                              >
                                Corrigir
                              </Button>
                            )}
                            {canRenewOrAnnul && (
                              <Button
                                color="error"
                                onClick={() => setAnnulTarget(document)}
                                aria-label={`Anular documento ${labelTarget}`}
                                startIcon={<BlockOutlined aria-hidden="true" />}
                                sx={{ minHeight: 48 }}
                              >
                                Anular
                              </Button>
                            )}
                          </CardActions>
                        </Card>
                      )
                    })}
                  </Stack>
                ) : (
                  <DataTable
                    caption="Documentos de veículos cadastrados"
                    columns={LIST_COLUMNS}
                    rows={state.listData.items}
                    rowKey={(document) => document.id}
                    busy={state.listLoading}
                    minWidth={980}
                    renderActions={(document) => {
                      const labelTarget = `${VEHICLE_DOCUMENT_TYPE_LABELS[document.documentType]} do veículo ${document.vehicle.licensePlate}`
                      const canRenewOrAnnul = !document.isAnnulled && document.supersededById === null
                      return (
                        <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => { void state.openDetail(document.id) }}
                            aria-label={`Ver detalhes do documento ${labelTarget}`}
                            sx={{ minHeight: 44 }}
                          >
                            Ver detalhes
                          </Button>
                          {!document.isAnnulled && (
                            <Button
                              size="small"
                              onClick={() => setFormDialog({ mode: 'edit', document })}
                              aria-label={`Corrigir documento ${labelTarget}`}
                              sx={{ minHeight: 44 }}
                            >
                              Corrigir
                            </Button>
                          )}
                          {canRenewOrAnnul && (
                            <Button
                              size="small"
                              onClick={() => setFormDialog({ mode: 'renew', document })}
                              aria-label={`Renovar documento ${labelTarget}`}
                              sx={{ minHeight: 44 }}
                            >
                              Renovar
                            </Button>
                          )}
                          {canRenewOrAnnul && (
                            <Button
                              size="small"
                              color="error"
                              onClick={() => setAnnulTarget(document)}
                              aria-label={`Anular documento ${labelTarget}`}
                              sx={{ minHeight: 44 }}
                            >
                              Anular
                            </Button>
                          )}
                        </Stack>
                      )
                    }}
                  />
                )}
              </>
            )}
          </Box>
        </Stack>
      )}

      {formDialog && (
        <VehicleDocumentFormDialog
          key={formDialog.mode === 'create' ? 'create' : `${formDialog.mode}-${formDialog.document.id}-${formDialog.document.revision}`}
          api={api}
          mode={formDialog.mode}
          document={formDialog.mode === 'create' ? undefined : formDialog.document}
          vehicles={state.vehicles}
          referenceDate={referenceDate}
          onSaved={handleSaved}
          onCancel={() => setFormDialog(null)}
          onConflictReload={handleConflictReload}
        />
      )}

      {annulTarget && (
        <VehicleDocumentAnnulDialog
          key={`annul-${annulTarget.id}-${annulTarget.revision}`}
          api={api}
          document={annulTarget}
          onAnnulled={handleAnnulled}
          onCancel={() => setAnnulTarget(null)}
          onConflictReload={handleConflictReload}
        />
      )}

      {state.selection && !formDialog && !annulTarget && (
        <VehicleDocumentDetailDialog
          selection={state.selection}
          canWrite={allowed}
          referenceDate={referenceDate}
          onClose={state.dismissDetail}
          onRetry={() => {
            if (state.selection) void state.openDetail(state.selection.id)
          }}
          onSelectDocument={(id) => { void state.openDetail(id) }}
          onEdit={(document) => setFormDialog({ mode: 'edit', document })}
          onRenew={(document) => setFormDialog({ mode: 'renew', document })}
          onAnnul={(document) => setAnnulTarget(document)}
        />
      )}
    </Box>
  )
}

export default VehicleDocumentsPage
