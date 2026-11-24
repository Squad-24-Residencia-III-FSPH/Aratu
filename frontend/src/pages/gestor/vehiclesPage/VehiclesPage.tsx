import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Alert, Box, Button, Stack, Typography } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import AutorenewIcon from '@mui/icons-material/Autorenew'
import EditIcon from '@mui/icons-material/Edit'
import { useAuth } from '../../../auth/useAuth'
import { resolveProfile } from '../../../auth/profiles'
import { accessibleControls } from '../../../components/ui/accessibleControls'
import DataTable from '../../../components/ui/DataTable'
import type { DataTableColumn } from '../../../components/ui/DataTable'
import FilterBar from '../../../components/ui/FilterBar'
import { FormField, FormSelect } from '../../../components/ui/FormField'
import PageHeader from '../../../components/ui/PageHeader'
import StateFeedback from '../../../components/ui/StateFeedback'
import StatusChip from '../../../components/ui/StatusChip'
import type { StatusTone } from '../../../components/ui/StatusChip'
import { listVehicles, VehicleRequestError } from '../../../services/vehiclesService'
import { canReadVehicles, canWriteVehicles } from '../../../vehicles/vehicleAccess'
import {
  VEHICLE_CATEGORIES,
  VEHICLE_CATEGORY_LABELS,
  VEHICLE_OPERATION_LABELS,
  VEHICLE_OPERATION_TYPES,
  VEHICLE_OWNERSHIP_LABELS,
  VEHICLE_STATUSES,
  VEHICLE_STATUS_LABELS,
} from '../../../vehicles/vehicleTypes'
import type {
  Vehicle,
  VehicleCategory,
  VehicleOperationType,
  VehicleStatus,
} from '../../../vehicles/vehicleTypes'
import {
  areVehicleFiltersEqual,
  buildVehiclesSearchParams,
  describeVehicleFilters,
  EMPTY_VEHICLE_FILTERS,
  hasActiveVehicleFilters,
  parseVehiclesUrlParams,
  toVehicleApiFilters,
} from './vehicleFilters'
import type { VehicleFilterValues } from './vehicleFilters'
import VehicleFormDialog from './VehicleFormDialog'
import VehicleStatusDialog from './VehicleStatusDialog'

interface ConfirmedVehiclesSnapshot {
  filters: VehicleFilterValues
  vehicles: Vehicle[]
}

interface VehiclesFetchState {
  completedKey: string | null
  confirmed: ConfirmedVehiclesSnapshot | null
  errorKey: string | null
  errorMessage: string | null
  forbiddenKey: string | null
}

const INITIAL_FETCH_STATE: VehiclesFetchState = {
  completedKey: null,
  confirmed: null,
  errorKey: null,
  errorMessage: null,
  forbiddenKey: null,
}

const DEFAULT_LOAD_ERROR = 'Não foi possível carregar os veículos.'

const STATUS_OPTIONS = VEHICLE_STATUSES.map((value) => ({ value, label: VEHICLE_STATUS_LABELS[value] }))
const CATEGORY_OPTIONS = VEHICLE_CATEGORIES.map((value) => ({ value, label: VEHICLE_CATEGORY_LABELS[value] }))
const OPERATION_OPTIONS = VEHICLE_OPERATION_TYPES.map((value) => ({ value, label: VEHICLE_OPERATION_LABELS[value] }))

const STATUS_TONES: Readonly<Record<VehicleStatus, StatusTone>> = {
  AVAILABLE: 'success',
  IN_MAINTENANCE: 'warning',
  INACTIVE: 'neutral',
}

const VEHICLE_COLUMNS: readonly DataTableColumn<Vehicle>[] = [
  { key: 'licensePlate', header: 'Placa', render: (vehicle) => <strong>{vehicle.licensePlate}</strong> },
  {
    key: 'brandModel',
    header: 'Marca / Modelo',
    render: (vehicle) => [vehicle.brand, vehicle.model].filter(Boolean).join(' / ') || '—',
  },
  { key: 'year', header: 'Ano', render: (vehicle) => vehicle.year ?? '—' },
  { key: 'vehicleType', header: 'Tipo', render: (vehicle) => vehicle.vehicleType ?? '—' },
  {
    key: 'categories',
    header: 'Categorias',
    render: (vehicle) => vehicle.categories.map((category) => VEHICLE_CATEGORY_LABELS[category]).join(', '),
  },
  {
    key: 'operation',
    header: 'Operação',
    render: (vehicle) => VEHICLE_OPERATION_LABELS[vehicle.operationType],
  },
  {
    key: 'ownership',
    header: 'Propriedade',
    render: (vehicle) => VEHICLE_OWNERSHIP_LABELS[vehicle.ownership],
  },
  { key: 'seats', header: 'Capacidade', align: 'right', render: (vehicle) => vehicle.seats },
  { key: 'bodyLimit', header: 'Limite de corpos', align: 'right', render: (vehicle) => vehicle.bodyLimit },
  {
    key: 'status',
    header: 'Situação',
    render: (vehicle) => (
      <StatusChip label={VEHICLE_STATUS_LABELS[vehicle.status]} tone={STATUS_TONES[vehicle.status]} />
    ),
  },
]

/** Tela de cadastro e consulta de veículos integrada à API `/vehicles`. */
export default function VehiclesPage() {
  const { api, session } = useAuth()
  const profile = session ? resolveProfile(session.perfil) : null
  const canWrite = canWriteVehicles(profile)
  const allowed = canReadVehicles(profile) || canWrite
  const reportedBy = session?.nome ?? ''

  const [searchParams, setSearchParams] = useSearchParams()
  const urlState = useMemo(() => parseVehiclesUrlParams(searchParams), [searchParams])
  const filterValues = urlState.filters
  const typeFilter = urlState.vehicleType

  const [fetchState, setFetchState] = useState<VehiclesFetchState>(INITIAL_FETCH_STATE)
  const [refreshToken, setRefreshToken] = useState(0)
  const [feedback, setFeedback] = useState<{ severity: 'success' | 'warning'; message: string } | null>(null)
  const [formDialog, setFormDialog] = useState<
    { mode: 'create' } | { mode: 'edit'; vehicle: Vehicle } | null
  >(null)
  const [statusVehicle, setStatusVehicle] = useState<Vehicle | null>(null)

  useEffect(() => {
    const previousTitle = document.title
    document.title = 'Veículos da Frota — Aratu'
    return () => {
      document.title = previousTitle
    }
  }, [])

  const apiFilters = useMemo(() => toVehicleApiFilters(filterValues), [filterValues])
  const requestKey = useMemo(
    () => JSON.stringify([filterValues.status, filterValues.category, filterValues.operationType, refreshToken]),
    [filterValues.category, filterValues.operationType, filterValues.status, refreshToken],
  )
  const filtersActive = hasActiveVehicleFilters(filterValues, typeFilter)

  useEffect(() => {
    if (!allowed) return

    let isCurrent = true
    void listVehicles(api, apiFilters)
      .then((loaded) => {
        if (!isCurrent) return
        setFetchState({
          completedKey: requestKey,
          confirmed: { filters: filterValues, vehicles: loaded },
          errorKey: null,
          errorMessage: null,
          forbiddenKey: null,
        })
      })
      .catch((error: unknown) => {
        if (!isCurrent) return
        if (error instanceof VehicleRequestError && error.kind === 'forbidden') {
          setFetchState({
            completedKey: null,
            confirmed: null,
            errorKey: null,
            errorMessage: null,
            forbiddenKey: requestKey,
          })
          return
        }
        setFetchState((previous) => ({
          completedKey: null,
          confirmed: previous.confirmed,
          errorKey: requestKey,
          errorMessage: error instanceof Error ? error.message : DEFAULT_LOAD_ERROR,
          forbiddenKey: null,
        }))
      })
    return () => { isCurrent = false }
  }, [allowed, api, apiFilters, filterValues, requestKey])

  const forbidden = allowed && fetchState.forbiddenKey === requestKey
  const loadError = fetchState.errorKey === requestKey ? fetchState.errorMessage : null
  const loading = allowed
    && !forbidden
    && loadError === null
    && fetchState.completedKey !== requestKey
  const confirmedSnapshot = forbidden ? null : fetchState.confirmed

  const isStale = confirmedSnapshot !== null
    && (loading || loadError !== null || !areVehicleFiltersEqual(confirmedSnapshot.filters, filterValues))
  const actionsSuspended = isStale

  const visibleVehicles = useMemo(() => {
    if (!confirmedSnapshot) return []
    const term = typeFilter.trim().toLowerCase()
    if (!term) return confirmedSnapshot.vehicles
    return confirmedSnapshot.vehicles.filter((vehicle) => (vehicle.vehicleType ?? '').toLowerCase().includes(term))
  }, [confirmedSnapshot, typeFilter])

  function syncUrlFilters(nextFilters: VehicleFilterValues, nextTypeFilter: string) {
    setSearchParams(buildVehiclesSearchParams(nextFilters, nextTypeFilter), { replace: true })
  }

  function reload() {
    setRefreshToken((current) => current + 1)
  }

  function changeFilter(patch: Partial<VehicleFilterValues>) {
    syncUrlFilters({ ...filterValues, ...patch }, typeFilter)
  }

  function clearFilters() {
    syncUrlFilters(EMPTY_VEHICLE_FILTERS, '')
    if (loadError !== null && areVehicleFiltersEqual(filterValues, EMPTY_VEHICLE_FILTERS)) {
      reload()
    }
  }

  function handleSaved(saved: Vehicle) {
    const wasStatusChange = statusVehicle !== null
    const wasEdit = formDialog?.mode === 'edit'
    setFormDialog(null)
    setStatusVehicle(null)
    setFeedback({
      severity: 'success',
      message: wasStatusChange
        ? `Situação alterada para ${VEHICLE_STATUS_LABELS[saved.status]}.`
        : wasEdit ? 'Veículo atualizado com sucesso.' : 'Veículo cadastrado com sucesso.',
    })
    reload()
  }

  function handleConflict(message: string) {
    setFormDialog(null)
    setStatusVehicle(null)
    setFeedback({ severity: 'warning', message })
    reload()
  }

  const confirmedDescription = confirmedSnapshot
    ? describeVehicleFilters(confirmedSnapshot.filters, typeFilter)
    : ''
  const requestedDescription = describeVehicleFilters(filterValues, typeFilter)

  return (
    <Box sx={{ minWidth: 0, ...accessibleControls }}>
      <PageHeader
        title="Veículos da Frota"
        breadcrumbs={['Início', 'Veículos']}
        description="Consulte, cadastre e mantenha a situação dos veículos da FSPH e do SVO."
        sx={{ mb: { xs: 2, md: 3 } }}
        actions={canWrite
          ? (
              <Button
                variant="contained"
                startIcon={<AddIcon aria-hidden="true" />}
                onClick={() => setFormDialog({ mode: 'create' })}
                sx={{ minHeight: 44 }}
              >
                Cadastrar veículo
              </Button>
            )
          : undefined}
      />

      {!allowed && <StateFeedback kind="forbidden" />}

      {allowed && (
        <>
          <FilterBar
            label="Filtros de veículos"
            sx={{ p: { xs: 1.5, md: 2 }, mb: { xs: 2, md: 3 }, borderRadius: 2 }}
          >
            <Box sx={{ flex: { xs: '0 0 auto', md: '1 1 180px' }, minWidth: 0, width: { xs: '100%', md: 'auto' } }}>
              <FormSelect
                label="Situação"
                value={filterValues.status}
                onChange={(value) => changeFilter({ status: value as VehicleStatus | '' })}
                options={STATUS_OPTIONS}
                emptyLabel="Todas as situações"
              />
            </Box>
            <Box sx={{ flex: { xs: '0 0 auto', md: '1 1 180px' }, minWidth: 0, width: { xs: '100%', md: 'auto' } }}>
              <FormSelect
                label="Tipo (categoria)"
                value={filterValues.category}
                onChange={(value) => changeFilter({ category: value as VehicleCategory | '' })}
                options={CATEGORY_OPTIONS}
                emptyLabel="Todos os tipos"
              />
            </Box>
            <Box sx={{ flex: { xs: '0 0 auto', md: '1 1 180px' }, minWidth: 0, width: { xs: '100%', md: 'auto' } }}>
              <FormSelect
                label="Operação"
                value={filterValues.operationType}
                onChange={(value) => changeFilter({ operationType: value as VehicleOperationType | '' })}
                options={OPERATION_OPTIONS}
                emptyLabel="Todas as operações"
              />
            </Box>
            <Box sx={{ flex: { xs: '0 0 auto', md: '1 1 180px' }, minWidth: 0, width: { xs: '100%', md: 'auto' } }}>
              <FormField
                label="Tipo de veículo"
                value={typeFilter}
                onChange={(value) => syncUrlFilters(filterValues, value)}
                placeholder="Ex.: Van"
                helperText="Filtra a lista já carregada."
              />
            </Box>
            <Button
              variant="outlined"
              onClick={clearFilters}
              disabled={!filtersActive}
              sx={{ minHeight: 44, width: { xs: '100%', md: 'auto' } }}
            >
              Limpar filtros
            </Button>
          </FilterBar>

          {!canWrite && (
            <Alert severity="info" sx={{ mb: 2 }}>
              Seu perfil permite apenas consultar veículos.
            </Alert>
          )}

          {feedback && (
            <Alert
              severity={feedback.severity}
              role="status"
              onClose={() => setFeedback(null)}
              sx={{ mb: 2 }}
            >
              {feedback.message}
            </Alert>
          )}

          {forbidden && <StateFeedback kind="forbidden" />}

          {!forbidden && loading && confirmedSnapshot === null && <StateFeedback kind="loading" />}

          {!forbidden && !loading && loadError && confirmedSnapshot === null && (
            <StateFeedback
              kind="error"
              title={DEFAULT_LOAD_ERROR}
              description={loadError !== DEFAULT_LOAD_ERROR ? loadError : undefined}
              actionLabel="Tentar novamente"
              onAction={reload}
            />
          )}

          {!forbidden && loadError && confirmedSnapshot !== null && (
            <StateFeedback
              kind="partial"
              title="A lista exibida está desatualizada."
              description={`${loadError} Exibindo o recorte confirmado anterior (${confirmedDescription}) em vez de "${requestedDescription}". As ações da lista estão suspensas até recarregar com sucesso.`}
              actionLabel="Tentar novamente"
              onAction={reload}
            />
          )}

          {!forbidden && loading && confirmedSnapshot !== null && (
            <Box role="status" aria-live="polite" sx={{ mb: 2 }}>
              <Typography variant="body2" color="text.secondary">
                Atualizando a lista para {requestedDescription}. Exibindo temporariamente o recorte anterior ({confirmedDescription}) com ações suspensas.
              </Typography>
            </Box>
          )}

          {!forbidden && confirmedSnapshot !== null && (
            <Typography
              variant="body2"
              color={isStale ? 'warning.dark' : 'text.secondary'}
              sx={{ mb: 1.5, fontWeight: isStale ? 700 : 400 }}
            >
              {isStale
                ? `Recorte exibido (desatualizado): ${confirmedDescription} · ${visibleVehicles.length} ${visibleVehicles.length === 1 ? 'veículo' : 'veículos'}`
                : `Recorte confirmado: ${confirmedDescription} · ${visibleVehicles.length} ${visibleVehicles.length === 1 ? 'veículo' : 'veículos'}`}
            </Typography>
          )}

          {!forbidden && confirmedSnapshot !== null && visibleVehicles.length > 0 && (
            <DataTable
              caption="Veículos da frota"
              columns={VEHICLE_COLUMNS}
              rows={visibleVehicles}
              rowKey={(vehicle) => vehicle.id}
              busy={loading}
              renderActions={canWrite
                ? (vehicle) => (
                    <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
                      <Button
                        size="small"
                        startIcon={<EditIcon aria-hidden="true" />}
                        onClick={() => setFormDialog({ mode: 'edit', vehicle })}
                        disabled={actionsSuspended}
                        aria-label={`Editar veículo ${vehicle.licensePlate}`}
                        sx={{ minHeight: 44 }}
                      >
                        Editar
                      </Button>
                      <Button
                        size="small"
                        startIcon={<AutorenewIcon aria-hidden="true" />}
                        onClick={() => setStatusVehicle(vehicle)}
                        disabled={actionsSuspended}
                        aria-label={`Alterar situação do veículo ${vehicle.licensePlate}`}
                        sx={{ minHeight: 44 }}
                      >
                        Alterar situação
                      </Button>
                    </Stack>
                  )
                : undefined}
            />
          )}

          {!forbidden && !loading && loadError === null && confirmedSnapshot !== null && visibleVehicles.length === 0 && (
            <StateFeedback
              kind="empty"
              description={filtersActive
                ? 'Ajuste ou limpe os filtros para ver outros veículos.'
                : 'Cadastre o primeiro veículo para iniciar a gestão da frota.'}
              actionLabel={filtersActive ? 'Limpar filtros' : canWrite ? 'Cadastrar veículo' : undefined}
              onAction={filtersActive
                ? clearFilters
                : canWrite ? () => setFormDialog({ mode: 'create' }) : undefined}
            />
          )}
        </>
      )}

      {formDialog && (
        <VehicleFormDialog
          key={formDialog.mode === 'edit' ? formDialog.vehicle.id : 'create'}
          api={api}
          reportedBy={reportedBy}
          {...(formDialog.mode === 'edit'
            ? { mode: 'edit' as const, vehicle: formDialog.vehicle }
            : { mode: 'create' as const })}
          onSaved={handleSaved}
          onCancel={() => setFormDialog(null)}
          onConflict={handleConflict}
        />
      )}

      {statusVehicle && (
        <VehicleStatusDialog
          key={statusVehicle.id}
          api={api}
          vehicle={statusVehicle}
          reportedBy={reportedBy}
          onSaved={handleSaved}
          onCancel={() => setStatusVehicle(null)}
          onConflict={handleConflict}
        />
      )}
    </Box>
  )
}
