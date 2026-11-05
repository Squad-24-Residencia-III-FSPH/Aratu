import { useEffect, useMemo, useState } from 'react'
import { Alert, Box, Button, Stack } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import AutorenewIcon from '@mui/icons-material/Autorenew'
import EditIcon from '@mui/icons-material/Edit'
import { useAuth } from '../../auth/useAuth'
import { resolveProfile } from '../../auth/profiles'
import DataTable from '../../components/ui/DataTable'
import type { DataTableColumn } from '../../components/ui/DataTable'
import FilterBar from '../../components/ui/FilterBar'
import { FormField, FormSelect } from '../../components/ui/FormField'
import PageHeader from '../../components/ui/PageHeader'
import StateFeedback from '../../components/ui/StateFeedback'
import StatusChip from '../../components/ui/StatusChip'
import type { StatusTone } from '../../components/ui/StatusChip'
import { listVehicles, VehicleRequestError } from '../../services/vehiclesService'
import { canReadVehicles, canWriteVehicles } from '../../vehicles/vehicleAccess'
import {
  VEHICLE_CATEGORIES,
  VEHICLE_CATEGORY_LABELS,
  VEHICLE_OPERATION_LABELS,
  VEHICLE_OPERATION_TYPES,
  VEHICLE_OWNERSHIP_LABELS,
  VEHICLE_STATUSES,
  VEHICLE_STATUS_LABELS,
} from '../../vehicles/vehicleTypes'
import type {
  Vehicle,
  VehicleCategory,
  VehicleFilters,
  VehicleOperationType,
  VehicleStatus,
} from '../../vehicles/vehicleTypes'
import VehicleFormDialog from './VehicleFormDialog'
import VehicleStatusDialog from './VehicleStatusDialog'

interface FilterValues {
  status: VehicleStatus | ''
  category: VehicleCategory | ''
  operationType: VehicleOperationType | ''
}

const EMPTY_FILTERS: FilterValues = { status: '', category: '', operationType: '' }

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

function toVehicleFilters(values: FilterValues): VehicleFilters {
  return {
    ...(values.status ? { status: values.status } : {}),
    ...(values.category ? { category: values.category } : {}),
    ...(values.operationType ? { operationType: values.operationType } : {}),
  }
}

/** Tela de cadastro e consulta de veículos integrada à API `/vehicles`. */
export default function VehiclesPage() {
  const { api, session } = useAuth()
  const profile = session ? resolveProfile(session.perfil) : null
  const canWrite = canWriteVehicles(profile)
  const allowed = canReadVehicles(profile) || canWrite
  const reportedBy = session?.nome ?? ''

  const [filterValues, setFilterValues] = useState<FilterValues>(EMPTY_FILTERS)
  const [typeFilter, setTypeFilter] = useState('')
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [forbidden, setForbidden] = useState(false)
  const [refreshToken, setRefreshToken] = useState(0)
  const [feedback, setFeedback] = useState<{ severity: 'success' | 'warning'; message: string } | null>(null)
  const [formDialog, setFormDialog] = useState<
    { mode: 'create' } | { mode: 'edit'; vehicle: Vehicle } | null
  >(null)
  const [statusVehicle, setStatusVehicle] = useState<Vehicle | null>(null)

  const filters = useMemo(() => toVehicleFilters(filterValues), [filterValues])
  const filtersActive = Boolean(filterValues.status || filterValues.category
    || filterValues.operationType || typeFilter.trim())

  useEffect(() => {
    let isCurrent = true
    void listVehicles(api, filters)
      .then((loaded) => {
        if (!isCurrent) return
        setVehicles(loaded)
        setLoading(false)
      })
      .catch((error: unknown) => {
        if (!isCurrent) return
        setLoading(false)
        if (error instanceof VehicleRequestError && error.kind === 'forbidden') {
          setForbidden(true)
          return
        }
        setLoadError(error instanceof Error ? error.message : 'Não foi possível carregar os veículos.')
      })
    return () => { isCurrent = false }
  }, [api, filters, refreshToken])

  const visibleVehicles = useMemo(() => {
    if (!vehicles) return []
    const term = typeFilter.trim().toLowerCase()
    if (!term) return vehicles
    return vehicles.filter((vehicle) => (vehicle.vehicleType ?? '').toLowerCase().includes(term))
  }, [vehicles, typeFilter])

  function reload() {
    setLoading(true)
    setLoadError(null)
    setForbidden(false)
    setRefreshToken((current) => current + 1)
  }

  function changeFilter(patch: Partial<FilterValues>) {
    setLoading(true)
    setLoadError(null)
    setForbidden(false)
    setFilterValues((current) => ({ ...current, ...patch }))
  }

  function clearFilters() {
    setLoading(true)
    setLoadError(null)
    setForbidden(false)
    setFilterValues(EMPTY_FILTERS)
    setTypeFilter('')
  }

  function handleSaved(saved: Vehicle) {
    const wasStatusChange = statusVehicle !== null
    setVehicles((current) => {
      if (!current) return [saved]
      return current.some((vehicle) => vehicle.id === saved.id)
        ? current.map((vehicle) => (vehicle.id === saved.id ? saved : vehicle))
        : [saved, ...current]
    })
    setFormDialog(null)
    setStatusVehicle(null)
    setFeedback({
      severity: 'success',
      message: wasStatusChange
        ? `Situação alterada para ${VEHICLE_STATUS_LABELS[saved.status]}.`
        : formDialog?.mode === 'edit' ? 'Veículo atualizado com sucesso.' : 'Veículo cadastrado com sucesso.',
    })
    reload()
  }

  function handleConflict(message: string) {
    setFormDialog(null)
    setStatusVehicle(null)
    setFeedback({ severity: 'warning', message })
    reload()
  }

  return (
    <Box>
      <PageHeader
        title="Veículos da Frota"
        breadcrumbs={['Início', 'Veículos']}
        description="Consulte, cadastre e mantenha a situação dos veículos da FSPH e do SVO."
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
          <FilterBar label="Filtros de veículos">
            <Box sx={{ flex: '1 1 200px', minWidth: 200 }}>
              <FormSelect
                label="Situação"
                value={filterValues.status}
                onChange={(value) => changeFilter({ status: value as VehicleStatus | '' })}
                options={STATUS_OPTIONS}
                emptyLabel="Todas as situações"
              />
            </Box>
            <Box sx={{ flex: '1 1 200px', minWidth: 200 }}>
              <FormSelect
                label="Tipo (categoria)"
                value={filterValues.category}
                onChange={(value) => changeFilter({ category: value as VehicleCategory | '' })}
                options={CATEGORY_OPTIONS}
                emptyLabel="Todos os tipos"
              />
            </Box>
            <Box sx={{ flex: '1 1 200px', minWidth: 200 }}>
              <FormSelect
                label="Operação"
                value={filterValues.operationType}
                onChange={(value) => changeFilter({ operationType: value as VehicleOperationType | '' })}
                options={OPERATION_OPTIONS}
                emptyLabel="Todas as operações"
              />
            </Box>
            <Box sx={{ flex: '1 1 200px', minWidth: 200 }}>
              <FormField
                label="Tipo de veículo"
                value={typeFilter}
                onChange={setTypeFilter}
                placeholder="Ex.: Van"
                helperText="Filtra a lista já carregada."
              />
            </Box>
            <Button
              variant="outlined"
              onClick={clearFilters}
              disabled={!filtersActive}
              sx={{ minHeight: 44 }}
            >
              Limpar filtros
            </Button>
          </FilterBar>

          {!canWrite && (
            <Alert severity="info" sx={{ mb: 3 }}>
              Seu perfil permite apenas consultar veículos.
            </Alert>
          )}

          {feedback && (
            <Alert
              severity={feedback.severity}
              role="status"
              onClose={() => setFeedback(null)}
              sx={{ mb: 3 }}
            >
              {feedback.message}
            </Alert>
          )}

          {forbidden && <StateFeedback kind="forbidden" />}

          {!forbidden && loading && vehicles === null && <StateFeedback kind="loading" />}

          {!forbidden && !loading && loadError && vehicles === null && (
            <StateFeedback
              kind="error"
              description={loadError}
              actionLabel="Tentar novamente"
              onAction={reload}
            />
          )}

          {!forbidden && loadError && vehicles !== null && (
            <StateFeedback
              kind="partial"
              description={loadError}
              actionLabel="Tentar novamente"
              onAction={reload}
            />
          )}

          {!forbidden && loading && vehicles !== null && (
            <Box role="status" aria-live="polite" sx={{ mb: 2 }}>
              Atualizando a lista...
            </Box>
          )}

          {!forbidden && vehicles !== null && visibleVehicles.length > 0 && (
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
                        aria-label={`Editar veículo ${vehicle.licensePlate}`}
                        sx={{ minHeight: 44 }}
                      >
                        Editar
                      </Button>
                      <Button
                        size="small"
                        startIcon={<AutorenewIcon aria-hidden="true" />}
                        onClick={() => setStatusVehicle(vehicle)}
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

          {!forbidden && !loading && vehicles !== null && visibleVehicles.length === 0 && (
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
