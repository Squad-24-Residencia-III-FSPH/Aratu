import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Box, Button, Card, CardActions, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Stack, Typography, useMediaQuery, useTheme } from '@mui/material'
import { resolveProfile } from '../../auth/profiles.ts'
import { useAuth } from '../../auth/useAuth.ts'
import DataTable from '../../components/ui/DataTable.tsx'
import type { DataTableColumn } from '../../components/ui/DataTable.tsx'
import FilterBar from '../../components/ui/FilterBar.tsx'
import { FormField, FormSelect } from '../../components/ui/FormField.tsx'
import PageHeader from '../../components/ui/PageHeader.tsx'
import StateFeedback from '../../components/ui/StateFeedback.tsx'
import StatusChip from '../../components/ui/StatusChip.tsx'
import { accessibleControls } from '../../components/ui/accessibleControls.ts'
import { useFines } from '../../hooks/useFines.ts'
import {
  canManageFines,
  FINE_STATUS_LABELS,
  FINE_STATUS_TONES,
  FINE_STATUSES,
  formatFineMoney,
  isValidLocalDateTime,
  localDateTimeToIso,
  sumFineAmounts,
} from '../../types/fine.ts'
import type { Fine, FineDetail, FineFilters, FineStatus } from '../../types/fine.ts'
import { formatCalendarDate, formatDateTime } from '../../utils/dates.ts'
import FineDetailDialog from './FineDetailDialog.tsx'
import FineFormDialog from './FineFormDialog.tsx'
import FineStatusDialog from './FineStatusDialog.tsx'
import styles from './FinesPage.module.css'

const COLUMNS: readonly DataTableColumn<Fine>[] = [
  {
    key: 'infractionCode',
    header: 'Código',
    width: 140,
    render: (fine) => <strong>{fine.infractionCode}</strong>,
  },
  {
    key: 'vehicle',
    header: 'Veículo',
    width: 180,
    render: (fine) => {
      const plate = fine.vehicleSnapshot?.licensePlate ?? fine.vehicle.licensePlate
      const model = fine.vehicleSnapshot?.model ?? fine.vehicle.model
      return (
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>{plate}</Typography>
          <Typography variant="caption" color="text.secondary">{model ?? 'Modelo não informado'}</Typography>
        </Box>
      )
    },
  },
  {
    key: 'driver',
    header: 'Motorista / Viagem',
    width: 210,
    render: (fine) => {
      const driverName = fine.driverSnapshot?.name ?? fine.driver?.name
      return (
        <Box>
          <Typography variant="body2">{driverName ?? 'Sem motorista vinculado'}</Typography>
          {fine.tripId && (
            <Typography variant="caption" color="text.secondary">
              Viagem #{fine.tripId}
            </Typography>
          )}
        </Box>
      )
    },
  },
  {
    key: 'infractionAt',
    header: 'Data da infração',
    width: 170,
    render: (fine) => formatDateTime(fine.infractionAt),
  },
  {
    key: 'dueAt',
    header: 'Vencimento',
    width: 130,
    render: (fine) => (fine.dueAt ? formatCalendarDate(fine.dueAt) : 'Não informado'),
  },
  {
    key: 'amount',
    header: 'Valor',
    align: 'right',
    width: 140,
    render: (fine) => formatFineMoney(fine.amount),
  },
  {
    key: 'status',
    header: 'Situação',
    width: 140,
    render: (fine) => (
      <StatusChip label={FINE_STATUS_LABELS[fine.status]} tone={FINE_STATUS_TONES[fine.status]} />
    ),
  },
]

/** Tela principal de gestão de multas e infrações (FROTA-74). */
export function FinesPage() {
  const { api, session } = useAuth()
  const profile = session ? resolveProfile(session.perfil) : null
  const allowed = canManageFines(profile)
  const theme = useTheme()
  const smallScreen = useMediaQuery(theme.breakpoints.down('sm'))

  const [filterInputs, setFilterInputs] = useState({
    vehicleId: '',
    driverId: '',
    status: '',
    from: '',
    to: '',
  })
  const [filters, setFilters] = useState<FineFilters>({})
  const [filterError, setFilterError] = useState('')
  const [formState, setFormState] = useState<{ fine?: Fine } | null>(null)
  const [statusDialog, setStatusDialog] = useState<{ fine: FineDetail; nextStatus: FineStatus } | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState('')

  const triggerRef = useRef<HTMLElement | null>(null)

  const state = useFines(api, allowed, filters)

  useEffect(() => {
    const previous = document.title
    document.title = 'Multas e Infrações — Aratu'
    return () => {
      document.title = previous
    }
  }, [])

  const restoreFocus = () => {
    const target = triggerRef.current
    if (target && target.isConnected) {
      window.setTimeout(() => target.focus(), 0)
    }
    triggerRef.current = null
  }

  const summaryCards = useMemo(() => {
    const list = state.items ?? []
    return [
      ['Total no recorte', state.items ? String(list.length) : '—'],
      ['Pendentes', state.items ? String(list.filter((item) => item.status === 'PENDING').length) : '—'],
      ['Em recurso', state.items ? String(list.filter((item) => item.status === 'CONTESTED').length) : '—'],
      ['Valor total no recorte', state.items ? sumFineAmounts(list) : '—'],
    ] as const
  }, [state.items])

  const vehicleOptions = useMemo(() => (
    state.vehicles.map((vehicle) => ({
      value: vehicle.id,
      label: `${vehicle.licensePlate}${vehicle.model ? ` — ${vehicle.model}` : ''}`,
    }))
  ), [state.vehicles])

  const driverOptions = useMemo(() => (
    state.drivers.map((driver) => ({ value: driver.id, label: driver.name }))
  ), [state.drivers])

  const filtersActive = Boolean(
    filters.vehicleId || filters.driverId || filters.status || filters.from || filters.to,
  )

  function applyFilters() {
    if (filterInputs.from && !isValidLocalDateTime(filterInputs.from)) {
      setFilterError('Informe uma data/hora inicial válida.')
      return
    }
    if (filterInputs.to && !isValidLocalDateTime(filterInputs.to)) {
      setFilterError('Informe uma data/hora final válida.')
      return
    }
    if (filterInputs.from && filterInputs.to && new Date(filterInputs.from) >= new Date(filterInputs.to)) {
      setFilterError('O início do período deve anteceder o fim.')
      return
    }

    setFilterError('')
    setFilters({
      ...(filterInputs.vehicleId ? { vehicleId: filterInputs.vehicleId } : {}),
      ...(filterInputs.driverId ? { driverId: filterInputs.driverId } : {}),
      ...(filterInputs.status ? { status: filterInputs.status as FineStatus } : {}),
      ...(filterInputs.from ? { from: localDateTimeToIso(filterInputs.from) } : {}),
      ...(filterInputs.to ? { to: localDateTimeToIso(filterInputs.to) } : {}),
    })
    state.reload()
  }

  function clearFilters() {
    setFilterInputs({ vehicleId: '', driverId: '', status: '', from: '', to: '' })
    setFilters({})
    setFilterError('')
    state.reload()
  }

  function openCreateForm(trigger?: HTMLElement | null) {
    if (trigger) triggerRef.current = trigger
    setFormState({})
  }

  function openDetail(id: string, trigger?: HTMLElement | null) {
    if (trigger) triggerRef.current = trigger
    setSelectedId(id)
    void state.select(id)
  }

  function closeDetail() {
    setSelectedId(null)
    state.dismiss()
    restoreFocus()
  }

  function handleFormSaved(savedFine: Fine) {
    const wasEdit = Boolean(formState?.fine)
    setFormState(null)
    setSelectedId(savedFine.id)
    state.saved(savedFine.id, true)
    setFeedback(
      wasEdit
        ? `Multa #${savedFine.id} (${savedFine.infractionCode}) retificada com sucesso. Revisão ${savedFine.revision}.`
        : `Multa #${savedFine.id} (${savedFine.infractionCode}) registrada com sucesso.`,
    )
  }

  function handleStatusSaved(updatedFine: Fine) {
    setStatusDialog(null)
    setSelectedId(updatedFine.id)
    state.saved(updatedFine.id, true)
    setFeedback(
      `Situação da multa #${updatedFine.id} (${updatedFine.infractionCode}) alterada para ${FINE_STATUS_LABELS[updatedFine.status]}.`,
    )
  }

  return (
    <Box className={styles.page} sx={accessibleControls}>
      <PageHeader
        title="Multas e Infrações"
        breadcrumbs={['Início', 'Controle', 'Multas e Infrações']}
        description="Registre infrações da frota, confirme vínculos com viagens e acompanhe recursos, pagamentos e trilha histórica."
        actions={allowed ? (
          <Button
            type="button"
            variant="contained"
            onClick={(event) => openCreateForm(event.currentTarget)}
            disabled={state.vehicles.length === 0 || Boolean(state.optionsError)}
            sx={{ minHeight: 44 }}
          >
            Registrar multa
          </Button>
        ) : undefined}
      />

      {!allowed ? (
        <StateFeedback
          kind="forbidden"
          title="Seu perfil não tem permissão para consultar multas e infrações."
        />
      ) : (
        <>
          {feedback && (
            <Alert severity="success" role="status" sx={{ mb: 2 }}>
              {feedback}
            </Alert>
          )}

          {state.optionsError && (
            <StateFeedback
              kind="partial"
              title="Não foi possível carregar todos os catálogos de veículos e motoristas."
              description={state.optionsError}
              actionLabel="Tentar novamente"
              onAction={state.reloadOptions}
            />
          )}

          {!state.optionsLoading && !state.optionsError && state.vehicles.length === 0 && (
            <StateFeedback
              kind="empty"
              title="Nenhum veículo cadastrado"
              description="Cadastre ao menos um veículo para registrar multas da frota."
            />
          )}

          <FilterBar label="Filtros de multas e infrações">
            <Box sx={{ flex: { xs: '1 1 100%', md: '1 1 190px' }, minWidth: 0 }}>
              <FormSelect
                label="Veículo"
                value={filterInputs.vehicleId}
                options={vehicleOptions}
                emptyLabel="Todos os veículos"
                displayEmpty
                onChange={(vehicleId) => setFilterInputs((current) => ({ ...current, vehicleId }))}
              />
            </Box>
            <Box sx={{ flex: { xs: '1 1 100%', md: '1 1 190px' }, minWidth: 0 }}>
              <FormSelect
                label="Motorista"
                value={filterInputs.driverId}
                options={driverOptions}
                emptyLabel="Todos os motoristas"
                displayEmpty
                onChange={(driverId) => setFilterInputs((current) => ({ ...current, driverId }))}
              />
            </Box>
            <Box sx={{ flex: { xs: '1 1 100%', md: '1 1 160px' }, minWidth: 0 }}>
              <FormSelect
                label="Situação"
                value={filterInputs.status}
                options={FINE_STATUSES.map((status) => ({ value: status, label: FINE_STATUS_LABELS[status] }))}
                emptyLabel="Todas as situações"
                displayEmpty
                onChange={(status) => setFilterInputs((current) => ({ ...current, status }))}
              />
            </Box>
            <Box sx={{ flex: { xs: '1 1 100%', md: '1 1 210px' }, minWidth: 0 }}>
              <FormField
                label="Início do período"
                type="datetime-local"
                value={filterInputs.from}
                onChange={(from) => setFilterInputs((current) => ({ ...current, from }))}
                helperText="Horário local deste dispositivo."
              />
            </Box>
            <Box sx={{ flex: { xs: '1 1 100%', md: '1 1 210px' }, minWidth: 0 }}>
              <FormField
                label="Fim do período"
                type="datetime-local"
                value={filterInputs.to}
                onChange={(to) => setFilterInputs((current) => ({ ...current, to }))}
                helperText="Limite final não incluído."
              />
            </Box>
            <Button type="button" variant="outlined" onClick={applyFilters} sx={{ minHeight: 44 }}>
              Aplicar filtros
            </Button>
            <Button type="button" onClick={clearFilters} sx={{ minHeight: 44 }}>
              Limpar filtros
            </Button>
            <Button type="button" onClick={state.reload} sx={{ minHeight: 44 }}>
              Atualizar
            </Button>
          </FilterBar>

          {filterError && (
            <Alert severity="error" role="alert" sx={{ mb: 2 }}>
              {filterError}
            </Alert>
          )}

          {state.loading && state.items === null && (
            <StateFeedback kind="loading" title="Carregando multas..." />
          )}

          {state.error && (
            <StateFeedback
              kind={state.items ? 'partial' : 'error'}
              title={state.items ? 'Os dados exibidos podem estar desatualizados.' : state.error}
              description={state.items ? state.error : undefined}
              actionLabel="Tentar novamente"
              onAction={state.reload}
            />
          )}

          {state.items && (
            <>
              <Box className={styles.summaryGrid} aria-busy={state.loading ? 'true' : undefined}>
                {summaryCards.map(([label, value]) => (
                  <Paper key={label} variant="outlined" sx={{ p: 2, minWidth: 0 }}>
                    <Typography variant="body2" color="text.secondary">{label}</Typography>
                    <Typography variant="h5" component="p" sx={{ mt: 0.75, fontWeight: 700 }}>
                      {value}
                    </Typography>
                  </Paper>
                ))}
              </Box>

              {state.items.length === 0 ? (
                <StateFeedback
                  kind="empty"
                  title={filtersActive ? 'Nenhuma multa encontrada com os filtros atuais.' : 'Nenhuma multa registrada.'}
                  description={
                    filtersActive
                      ? 'Ajuste os filtros ou limpe a pesquisa para visualizar outros registros.'
                      : 'Registre uma multa quando houver notificação de infração da frota.'
                  }
                  actionLabel={filtersActive ? 'Limpar filtros' : undefined}
                  onAction={filtersActive ? clearFilters : undefined}
                  centered
                />
              ) : smallScreen ? (
                <Stack spacing={1.5}>
                  {state.items.map((fine) => {
                    const plate = fine.vehicleSnapshot?.licensePlate ?? fine.vehicle.licensePlate
                    const driverName = fine.driverSnapshot?.name ?? fine.driver?.name
                    return (
                      <Card key={fine.id} variant="outlined">
                        <CardContent>
                          <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 1, alignItems: 'flex-start' }}>
                            <Box sx={{ minWidth: 0 }}>
                              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                                {plate} · {formatFineMoney(fine.amount)}
                              </Typography>
                              <Typography variant="body2">
                                {fine.infractionCode} · {fine.description}
                              </Typography>
                            </Box>
                            <StatusChip label={FINE_STATUS_LABELS[fine.status]} tone={FINE_STATUS_TONES[fine.status]} />
                          </Stack>
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                            {formatDateTime(fine.infractionAt)} · {driverName ?? 'Sem motorista vinculado'} · revisão {fine.revision}
                          </Typography>
                        </CardContent>
                        <CardActions sx={{ px: 2, pb: 2 }}>
                          <Button
                            type="button"
                            variant="outlined"
                            fullWidth
                            onClick={(event) => openDetail(fine.id, event.currentTarget)}
                            aria-label={`Ver detalhes da multa #${fine.id} código ${fine.infractionCode}`}
                            sx={{ minHeight: 48 }}
                          >
                            Ver detalhes
                          </Button>
                        </CardActions>
                      </Card>
                    )
                  })}
                </Stack>
              ) : (
                <DataTable
                  caption="Multas e infrações registradas — ordenadas por data da infração"
                  columns={COLUMNS}
                  rows={state.items}
                  rowKey={(fine) => fine.id}
                  busy={state.loading}
                  containerClassName={styles.tableContainer}
                  renderActions={(fine) => (
                    <Button
                      type="button"
                      variant="outlined"
                      onClick={(event) => openDetail(fine.id, event.currentTarget)}
                      aria-label={`Ver detalhes da multa #${fine.id} código ${fine.infractionCode}`}
                      sx={{ minHeight: 44 }}
                    >
                      Ver detalhes
                    </Button>
                  )}
                />
              )}
            </>
          )}

          {formState && (
            <FineFormDialog
              key={formState.fine ? `${formState.fine.id}-${formState.fine.revision}` : 'create-fine'}
              fine={formState.fine}
              vehicles={state.vehicles}
              drivers={state.drivers}
              api={api}
              onClose={() => {
                const reopenDetail = Boolean(formState.fine)
                setFormState(null)
                if (!reopenDetail) restoreFocus()
              }}
              onSaved={handleFormSaved}
              onConflict={() => {
                const edited = formState.fine
                setFormState(null)
                if (edited) openDetail(edited.id)
              }}
            />
          )}

          {state.selection && !formState && !statusDialog && (
            state.selection.fine ? (
              <FineDetailDialog
                fine={state.selection.fine}
                loading={state.selection.loading}
                error={state.selection.error}
                onRetry={() => {
                  if (selectedId) void state.select(selectedId)
                }}
                onClose={closeDetail}
                onEdit={(detail) => setFormState({ fine: detail })}
                onRequestStatusChange={(detail, nextStatus) => setStatusDialog({ fine: detail, nextStatus })}
              />
            ) : (
              <Dialog open onClose={closeDetail} fullWidth aria-labelledby="fine-detail-fallback-title">
                <DialogTitle id="fine-detail-fallback-title">Consultar multa</DialogTitle>
                <DialogContent>
                  <StateFeedback
                    kind={state.selection.loading ? 'loading' : 'error'}
                    title={state.selection.loading ? 'Carregando multa...' : state.selection.error}
                    actionLabel={state.selection.loading ? undefined : 'Tentar novamente'}
                    onAction={state.selection.loading ? undefined : () => {
                      if (selectedId) void state.select(selectedId)
                    }}
                    sx={{ mb: 0 }}
                  />
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                  <Button type="button" onClick={closeDetail} sx={{ minHeight: 44 }}>
                    Fechar
                  </Button>
                </DialogActions>
              </Dialog>
            )
          )}

          {statusDialog && (
            <FineStatusDialog
              key={`${statusDialog.fine.id}-${statusDialog.fine.revision}-${statusDialog.nextStatus}`}
              api={api}
              fine={statusDialog.fine}
              targetStatus={statusDialog.nextStatus}
              onSaved={handleStatusSaved}
              onCancel={() => setStatusDialog(null)}
              onConflict={() => {
                const fineId = statusDialog.fine.id
                setStatusDialog(null)
                openDetail(fineId)
              }}
            />
          )}
        </>
      )}
    </Box>
  )
}

export default FinesPage
