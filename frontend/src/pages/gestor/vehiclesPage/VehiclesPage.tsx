import { useEffect, useMemo, useState } from 'react'
import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Stack, Typography } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import AutorenewIcon from '@mui/icons-material/Autorenew'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { useAuth } from '../../../auth/useAuth'
import { hasPermission } from '../../../auth/access'
import DataTable from '../../../components/ui/DataTable'
import type { DataTableColumn } from '../../../components/ui/DataTable'
import FilterBar from '../../../components/ui/FilterBar'
import { FormField, FormSelect } from '../../../components/ui/FormField'
import PageHeader from '../../../components/ui/PageHeader'
import RowActionsMenu from '../../../components/ui/RowActionsMenu'
import type { RowActionItem } from '../../../components/ui/RowActionsMenu'
import StateFeedback from '../../../components/ui/StateFeedback'
import StatusChip from '../../../components/ui/StatusChip'
import type { StatusTone } from '../../../components/ui/StatusChip'
import { listVehiclePage, VehicleRequestError } from '../../../services/vehiclesService'
import {
  VEHICLE_CATEGORIES,
  VEHICLE_CATEGORY_LABELS,
  VEHICLE_OPERATION_LABELS,
  VEHICLE_OPERATION_TYPES,
  VEHICLE_STATUSES,
  VEHICLE_STATUS_LABELS,
} from '../../../vehicles/vehicleTypes'
import type { Vehicle, VehicleCategory, VehicleFilters, VehicleOperationType, VehiclePage, VehicleStatus } from '../../../vehicles/vehicleTypes'
import VehicleFormDialog from './VehicleFormDialog'
import VehicleStatusDialog from './VehicleStatusDialog'
import VehicleDetailsDialog from './VehicleDetailsDialog'

interface FilterValues {
  category: VehicleCategory | ''
  operationType: VehicleOperationType | ''
  status: VehicleStatus | ''
}

type StatusAction = { vehicle: Vehicle; mode: 'change' | 'archive' | 'restore' }
const PAGE_SIZE = 20
const EMPTY_FILTERS: FilterValues = { category: '', operationType: '', status: '' }
const VIEW_OPTIONS = [
  { value: 'operational', label: 'Em operação' },
  { value: 'archived', label: 'Arquivados' },
  { value: 'all', label: 'Todos' },
]
const STATUS_OPTIONS = VEHICLE_STATUSES.map((value) => ({ value, label: VEHICLE_STATUS_LABELS[value] }))
const CATEGORY_OPTIONS = VEHICLE_CATEGORIES.map((value) => ({ value, label: VEHICLE_CATEGORY_LABELS[value] }))
const OPERATION_OPTIONS = VEHICLE_OPERATION_TYPES.map((value) => ({ value, label: VEHICLE_OPERATION_LABELS[value] }))
const STATUS_TONES: Readonly<Record<VehicleStatus, StatusTone>> = {
  AVAILABLE: 'success', IN_MAINTENANCE: 'warning', INACTIVE: 'neutral',
}

function toVehicleFilters(values: FilterValues, view: 'operational' | 'archived' | 'all', search: string, page: number): VehicleFilters {
  return {
    view,
    page,
    pageSize: PAGE_SIZE,
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(values.status ? { status: values.status } : {}),
    ...(values.category ? { category: values.category } : {}),
    ...(values.operationType ? { operationType: values.operationType } : {}),
  }
}

/** Consulta a frota por páginas do servidor e mantém ações secundárias em um menu. */
export default function VehiclesPage() {
  const { api, session } = useAuth()
  const allowed = hasPermission(session, 'vehicles:read')
  const canCreate = hasPermission(session, 'vehicles:create')
  const canUpdate = hasPermission(session, 'vehicles:update')
  const canChangeStatus = hasPermission(session, 'vehicles:status:change')
  const canArchive = hasPermission(session, 'vehicles:archive')
  const canManageVehicleServices = hasPermission(session, 'services:vehicles:manage')
  const canWrite = canCreate || canUpdate || canChangeStatus || canArchive
  const reportedBy = session?.nome ?? ''
  const [filterValues, setFilterValues] = useState<FilterValues>(EMPTY_FILTERS)
  const [search, setSearch] = useState('')
  const [view, setView] = useState<'operational' | 'archived' | 'all'>('operational')
  const [page, setPage] = useState(1)
  const [vehicles, setVehicles] = useState<VehiclePage | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [forbidden, setForbidden] = useState(false)
  const [refreshToken, setRefreshToken] = useState(0)
  const [feedback, setFeedback] = useState<{ severity: 'success' | 'warning'; message: string } | null>(null)
  const [formDialog, setFormDialog] = useState<{ mode: 'create' } | { mode: 'edit'; vehicle: Vehicle } | null>(null)
  const [statusAction, setStatusAction] = useState<StatusAction | null>(null)
  const [detailsVehicle, setDetailsVehicle] = useState<Vehicle | null>(null)

  const columns: readonly DataTableColumn<Vehicle>[] = [
    {
      key: 'vehicle',
      header: 'Veículo',
      render: (vehicle) => <Button variant="text" onClick={() => setDetailsVehicle(vehicle)} aria-label={`Ver detalhes do veículo ${vehicle.licensePlate}`} sx={{ minHeight: 44, px: 0, textTransform: 'none', textAlign: 'left', justifyContent: 'flex-start' }}>
        <Box component="span" sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
          <Box component="strong">{vehicle.licensePlate}</Box>
          <Typography component="span" variant="body2" color="text.secondary">{[vehicle.brand, vehicle.model].filter(Boolean).join(' ') || 'Detalhes do cadastro'}</Typography>
        </Box>
      </Button>,
    },
    { key: 'operation', header: 'Operação', render: (vehicle) => VEHICLE_OPERATION_LABELS[vehicle.operationType] },
    { key: 'capacity', header: 'Capacidade', render: (vehicle) => vehicle.categories.includes('BODY') ? `${vehicle.bodyLimit} corpo(s)` : `${vehicle.seats} passageiro(s)` },
    { key: 'status', header: 'Situação', render: (vehicle) => <StatusChip label={VEHICLE_STATUS_LABELS[vehicle.status]} tone={STATUS_TONES[vehicle.status]} /> },
  ]

  const filters = useMemo(() => toVehicleFilters(filterValues, view, search, page), [filterValues, view, search, page])
  const filtersActive = Boolean(search.trim() || view !== 'operational' || filterValues.status || filterValues.category || filterValues.operationType)
  const categoryAndOperationActive = Boolean(filterValues.category || filterValues.operationType || filterValues.status)

  useEffect(() => {
    if (!allowed) return
    let current = true
    void listVehiclePage(api, filters)
      .then((result) => {
        if (current) {
          setVehicles(result)
          setLoading(false)
        }
      })
      .catch((error: unknown) => {
        if (!current) return
        setLoading(false)
        if (error instanceof VehicleRequestError && error.kind === 'forbidden') setForbidden(true)
        else setLoadError(error instanceof Error ? error.message : 'Não foi possível carregar os veículos.')
      })
    return () => { current = false }
  }, [allowed, api, filters, refreshToken])

  function reload() {
    setLoading(true)
    setLoadError(null)
    setForbidden(false)
    setRefreshToken((current) => current + 1)
  }

  function changeFilter(patch: Partial<FilterValues>) {
    setLoading(true)
    setLoadError(null)
    setPage(1)
    setFilterValues((current) => ({ ...current, ...patch }))
  }

  function clearFilters() {
    setSearch('')
    setView('operational')
    setFilterValues(EMPTY_FILTERS)
    setPage(1)
    reload()
  }

  function handleSaved(saved: Vehicle) {
    const action = statusAction
    setFormDialog(null)
    setStatusAction(null)
    setFeedback({
      severity: 'success',
      message: action?.mode === 'archive'
        ? `Veículo ${saved.licensePlate} arquivado.`
        : action?.mode === 'restore'
          ? `Veículo ${saved.licensePlate} restaurado.`
          : action?.mode === 'change'
            ? `Situação alterada para ${VEHICLE_STATUS_LABELS[saved.status]}.`
            : formDialog?.mode === 'edit' ? 'Veículo atualizado com sucesso.' : 'Veículo cadastrado com sucesso.',
    })
    reload()
  }

  function handleConflict(message: string) {
    setFormDialog(null)
    setStatusAction(null)
    setFeedback({ severity: 'warning', message })
    reload()
  }

  function handlePartialSaved(saved: Vehicle, message: string) {
    setFeedback({ severity: 'warning', message })
    setDetailsVehicle(saved)
    reload()
  }

  return (
    <Box>
      <PageHeader
        title="Veículos"
        description="Consulte a frota em operação e acesse os dados complementares sob demanda."
        actions={canCreate ? <Button variant="contained" startIcon={<AddIcon aria-hidden="true" />} onClick={() => setFormDialog({ mode: 'create' })} sx={{ minHeight: 44 }}>Cadastrar veículo</Button> : undefined}
      />
      {!allowed && <StateFeedback kind="forbidden" />}
      {allowed && <>
        <FilterBar label="Buscar veículos">
          <Box sx={{ flex: '1 1 280px', minWidth: { xs: '100%', sm: 260 } }}>
            <FormField label="Buscar pela placa" value={search} onChange={(value) => { setSearch(value); setPage(1); setLoading(true); setLoadError(null) }} placeholder="Ex.: ABC1D23" />
          </Box>
          <Box sx={{ width: { xs: '100%', sm: 190 } }}>
            <FormSelect label="Atividade" value={view} onChange={(value) => { setView(value as typeof view); setPage(1); setLoading(true); setLoadError(null) }} options={VIEW_OPTIONS} />
          </Box>
          {filtersActive && <Button color="inherit" onClick={clearFilters} sx={{ minHeight: 44 }}>Limpar filtros</Button>}
        </FilterBar>

        <Accordion disableGutters elevation={0} sx={{ mb: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1, '&:before': { display: 'none' } }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon aria-hidden="true" />} aria-controls="vehicle-more-filters" id="vehicle-more-filters-heading" sx={{ minHeight: 52 }}>
            <Typography>Mais filtros{categoryAndOperationActive ? ' · aplicados' : ''}</Typography>
          </AccordionSummary>
          <AccordionDetails id="vehicle-more-filters">
            <FilterBar label="Filtros complementares">
              <Box sx={{ flex: '1 1 200px', minWidth: 190 }}>
                <FormSelect label="Situação específica" value={filterValues.status} onChange={(value) => {
                  const status = value as VehicleStatus | ''
                  changeFilter({ status })
                  if (status === 'INACTIVE') setView('archived')
                  else if (status && view === 'archived') setView('all')
                }} options={STATUS_OPTIONS} emptyLabel="Todas as situações" />
              </Box>
              <Box sx={{ flex: '1 1 200px', minWidth: 190 }}>
                <FormSelect label="Categoria" value={filterValues.category} onChange={(value) => changeFilter({ category: value as VehicleCategory | '' })} options={CATEGORY_OPTIONS} emptyLabel="Todas as categorias" />
              </Box>
              <Box sx={{ flex: '1 1 200px', minWidth: 190 }}>
                <FormSelect label="Operação" value={filterValues.operationType} onChange={(value) => changeFilter({ operationType: value as VehicleOperationType | '' })} options={OPERATION_OPTIONS} emptyLabel="Todas as operações" />
              </Box>
            </FilterBar>
          </AccordionDetails>
        </Accordion>

        {!canWrite && <Alert severity="info" sx={{ mb: 2 }}>Seu perfil permite apenas consultar veículos.</Alert>}
        {feedback && <Alert severity={feedback.severity} role="status" onClose={() => setFeedback(null)} sx={{ mb: 2 }}>{feedback.message}</Alert>}
        {forbidden && <StateFeedback kind="forbidden" />}
        {!forbidden && loading && vehicles === null && <StateFeedback kind="loading" />}
        {!forbidden && !loading && loadError && vehicles === null && <StateFeedback kind="error" description={loadError} actionLabel="Tentar novamente" onAction={reload} />}
        {!forbidden && loadError && vehicles !== null && <StateFeedback kind="partial" description={loadError} actionLabel="Tentar novamente" onAction={reload} />}
        {!forbidden && loading && vehicles !== null && <Box role="status" aria-live="polite" sx={{ mb: 2 }}>Atualizando a lista…</Box>}
        {vehicles && <>
          <DataTable
            caption="Veículos"
            columns={columns}
            rows={vehicles.items}
            rowKey={(vehicle) => vehicle.id}
            busy={loading}
            minWidth={620}
            actionsWidth={64}
            emptyContent={!loading ? <StateFeedback kind="empty" title={filtersActive ? 'Nenhum veículo encontrado' : 'Nenhum veículo cadastrado'} description={filtersActive ? 'Ajuste a busca ou os filtros para consultar outros veículos.' : 'Cadastre o primeiro veículo para iniciar a gestão da frota.'} centered /> : undefined}
            renderActions={canUpdate || canChangeStatus || canArchive ? (vehicle) => {
              const actions: RowActionItem[] = [
                ...(canUpdate ? [{ key: 'edit', label: 'Editar cadastro', icon: <EditIcon fontSize="small" />, onSelect: () => setFormDialog({ mode: 'edit', vehicle }) }] : []),
                ...(canChangeStatus && vehicle.status !== 'INACTIVE' ? [{ key: 'status', label: 'Alterar situação', icon: <AutorenewIcon fontSize="small" />, onSelect: () => setStatusAction({ vehicle, mode: 'change' }) }] : []),
                ...(canArchive ? [vehicle.status === 'INACTIVE'
                  ? { key: 'restore', label: 'Restaurar', onSelect: () => setStatusAction({ vehicle, mode: 'restore' }) }
                  : { key: 'archive', label: 'Arquivar', danger: true, onSelect: () => setStatusAction({ vehicle, mode: 'archive' }) }] : []),
              ]
              return actions.length > 0 ? <RowActionsMenu label={`Ações do veículo ${vehicle.licensePlate}`} actions={actions} /> : null
            } : undefined}
          />
          <Stack component="nav" aria-label="Paginação de veículos" direction="row" sx={{ mt: 2, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
            <Typography variant="body2" color="text.secondary">{vehicles.total} veículo(s)</Typography>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <Button color="inherit" disabled={vehicles.page <= 1 || loading} onClick={() => { setPage((current) => Math.max(1, current - 1)); setLoading(true) }} sx={{ minHeight: 44 }}>Anterior</Button>
              <Typography role="status">Página {vehicles.page} de {Math.max(1, vehicles.totalPages)}</Typography>
              <Button color="inherit" disabled={vehicles.page >= vehicles.totalPages || loading} onClick={() => { setPage((current) => current + 1); setLoading(true) }} sx={{ minHeight: 44 }}>Próxima</Button>
            </Stack>
          </Stack>
        </>}
      </>}

      {formDialog && <VehicleFormDialog
        key={formDialog.mode === 'edit' ? formDialog.vehicle.id : 'create'}
        api={api}
        reportedBy={reportedBy}
        canManageServices={canManageVehicleServices}
        {...(formDialog.mode === 'edit' ? { mode: 'edit' as const, vehicle: formDialog.vehicle } : { mode: 'create' as const })}
        onSaved={handleSaved}
        onPartialSaved={handlePartialSaved}
        onCancel={() => setFormDialog(null)}
        onConflict={handleConflict}
      />}
      {statusAction && <VehicleStatusDialog
        key={`${statusAction.vehicle.id}-${statusAction.mode}`}
        api={api}
        vehicle={statusAction.vehicle}
        mode={statusAction.mode}
        reportedBy={reportedBy}
        onSaved={handleSaved}
        onCancel={() => setStatusAction(null)}
        onConflict={handleConflict}
      />}
      {detailsVehicle && <VehicleDetailsDialog vehicle={detailsVehicle} onClose={() => setDetailsVehicle(null)} />}
    </Box>
  )
}
