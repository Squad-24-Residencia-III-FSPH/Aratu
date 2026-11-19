import { useEffect, useState } from 'react'
import { Alert, Box, Button, Stack } from '@mui/material'
import { useAuth } from '../auth/useAuth'
import { resolveProfile } from '../auth/profiles'
import DataTable from '../components/ui/DataTable'
import type { DataTableColumn } from '../components/ui/DataTable'
import FilterBar from '../components/ui/FilterBar'
import { FormField, FormSelect } from '../components/ui/FormField'
import type { FormSelectOption } from '../components/ui/FormField'
import PageHeader from '../components/ui/PageHeader'
import StateFeedback from '../components/ui/StateFeedback'
import StatusChip from '../components/ui/StatusChip'
import type { StatusTone } from '../components/ui/StatusChip'
import { canAccessFines } from '../fines/fineAccess'
import { FINE_STATUS_LABELS } from '../fines/fineTypes'
import type { Fine, FineFilters, FineStatus, FineStatusAction } from '../fines/fineTypes'
import { listDrivers } from '../services/driversService'
import { FineRequestError, listFines } from '../services/finesService'
import { listVehicles } from '../services/vehiclesService'
import { formatCalendarDate } from '../utils/dates'
import FineFormDialog from './finesPage/FineFormDialog'
import FineStatusDialog from './finesPage/FineStatusDialog'

const EMPTY_FILTERS: FineFilters = { vehicleId: '', driverId: '', status: '', from: '', to: '' }
const STATUS_OPTIONS = Object.entries(FINE_STATUS_LABELS).map(([value, label]) => ({ value, label }))
const STATUS_TONES: Record<FineStatus, StatusTone> = {
  PENDING: 'warning', CONTESTED: 'info', PAID: 'success', CANCELED: 'neutral',
}
const CURRENCY = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const DATE_TIME = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
const FILTER_WIDTH = { width: { xs: '100%', md: 180 } }

/** Consulta o histórico e abre os fluxos de registro e mudança de situação. */
export default function FinesPage() {
  const { api, session } = useAuth()
  const allowed = canAccessFines(session ? resolveProfile(session.perfil) : null)
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [items, setItems] = useState<Fine[]>([])
  const [vehicles, setVehicles] = useState<FormSelectOption[]>([])
  const [drivers, setDrivers] = useState<FormSelectOption[]>([])
  const [optionsLoading, setOptionsLoading] = useState(true)
  const [optionsErrors, setOptionsErrors] = useState<string[]>([])
  const [optionsRetry, setOptionsRetry] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ message: string; forbidden: boolean } | null>(null)
  const [refresh, setRefresh] = useState(0)
  const [formOpen, setFormOpen] = useState(false)
  const [statusChange, setStatusChange] = useState<{ fine: Fine; status: FineStatusAction } | null>(null)
  const [notice, setNotice] = useState('')
  const periodError = filters.from && filters.to && filters.from > filters.to
    ? 'A data final deve ser igual ou posterior à data inicial.'
    : undefined

  useEffect(() => {
    const previousTitle = document.title
    document.title = 'Multas e infrações — Aratu'
    return () => { document.title = previousTitle }
  }, [])

  useEffect(() => {
    if (!allowed) return
    let current = true
    void Promise.allSettled([listVehicles(api), listDrivers(api)]).then(([vehicleResult, driverResult]) => {
      if (!current) return
      if (vehicleResult.status === 'fulfilled') {
        setVehicles(vehicleResult.value.map(({ id, licensePlate, model }) => ({
          value: id, label: model ? `${licensePlate} — ${model}` : licensePlate,
        })))
      }
      if (driverResult.status === 'fulfilled') {
        setDrivers(driverResult.value.map(({ id, name }) => ({ value: id, label: name })))
      }
      const errors = [vehicleResult, driverResult].flatMap((result) =>
        result.status === 'rejected' ? [result.reason instanceof Error ? result.reason.message : 'Falha ao carregar opções.'] : [])
      setOptionsErrors(errors)
      setOptionsLoading(false)
    })
    return () => { current = false }
  }, [allowed, api, optionsRetry])

  useEffect(() => {
    if (!allowed || periodError) return
    const controller = new AbortController()
    void listFines(api, filters, controller.signal)
      .then((result) => { if (!controller.signal.aborted) setItems(result) })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError({
            message: cause instanceof Error ? cause.message : 'Não foi possível carregar as multas.',
            forbidden: cause instanceof FineRequestError && cause.status === 403,
          })
        }
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [allowed, api, filters, periodError, refresh])

  function applyFilters(next: FineFilters) {
    setLoading(true)
    setError(null)
    setFilters(next)
  }

  function reload() {
    setLoading(true)
    setError(null)
    setRefresh((value) => value + 1)
  }

  const columns: DataTableColumn<Fine>[] = [
    { key: 'vehicle', header: 'Veículo', render: (fine) => fine.vehicleSnapshot?.licensePlate ?? fine.vehicle.licensePlate },
    { key: 'driver', header: 'Motorista', render: (fine) => fine.driverSnapshot?.name ?? fine.driver?.name ?? 'Sem motorista' },
    { key: 'date', header: 'Data e hora', render: (fine) => DATE_TIME.format(new Date(fine.infractionAt)) },
    { key: 'code', header: 'Código', render: (fine) => fine.infractionCode },
    { key: 'description', header: 'Descrição', render: (fine) => fine.description },
    { key: 'amount', header: 'Valor', align: 'right', render: (fine) => CURRENCY.format(Number(fine.amount)) },
    { key: 'due', header: 'Vencimento', render: (fine) => fine.dueAt ? formatCalendarDate(fine.dueAt) : 'Sem vencimento' },
    { key: 'status', header: 'Situação', render: (fine) => <StatusChip label={FINE_STATUS_LABELS[fine.status]} tone={STATUS_TONES[fine.status]} /> },
    {
      key: 'actions', header: 'Ações',
      render: (fine) => {
        const actions: FineStatusAction[] = fine.status === 'PENDING' ? ['PAID', 'CONTESTED']
          : fine.status === 'CONTESTED' ? ['PAID'] : []
        return <Stack sx={{ alignItems: 'flex-start' }}>
          {actions.map((status) => {
            const label = status === 'PAID' ? 'Marcar como paga' : 'Marcar em recurso'
            return <Button key={status} aria-label={`${label} a multa #${fine.id}`} onClick={() => setStatusChange({ fine, status })} sx={{ minHeight: 44 }}>{label}</Button>
          })}
        </Stack>
      },
    },
  ]

  const restricted = !allowed || error?.forbidden
  const filtersActive = Object.values(filters).some(Boolean)

  return (
    <Box sx={{ minWidth: 0 }}>
      <PageHeader title="Multas e infrações" titleVariant="h4" breadcrumbs={['Início', 'Multas e infrações']}
        actions={!restricted && <Button variant="contained" disabled={optionsLoading || vehicles.length === 0} onClick={() => setFormOpen(true)} sx={{ minHeight: 44 }}>Registrar multa</Button>} />
      {restricted ? <StateFeedback kind="forbidden" title="Acesso restrito" description={error?.message ?? 'Seu perfil não tem permissão para consultar multas.'} /> : <>
        {notice && <Alert severity="success" role="status" sx={{ mb: 2 }}>{notice}</Alert>}
        {optionsErrors.length > 0 && <StateFeedback kind="partial" title="Algumas opções de cadastro e filtro estão indisponíveis." description={optionsErrors.join(' ')} actionLabel="Tentar novamente" onAction={() => {
          setOptionsErrors([])
          setOptionsLoading(true)
          setOptionsRetry((value) => value + 1)
        }} />}
        {!optionsLoading && optionsErrors.length === 0 && vehicles.length === 0 && <StateFeedback kind="empty" title="Cadastre um veículo para registrar uma multa." />}
        <FilterBar label="Filtros do histórico de multas">
          <FormSelect label="Veículo" value={filters.vehicleId} onChange={(vehicleId) => applyFilters({ ...filters, vehicleId })} options={vehicles} emptyLabel="Todos os veículos" displayEmpty disabled={optionsLoading || vehicles.length === 0} sx={FILTER_WIDTH} />
          <FormSelect label="Motorista" value={filters.driverId} onChange={(driverId) => applyFilters({ ...filters, driverId })} options={drivers} emptyLabel="Todos os motoristas" displayEmpty disabled={optionsLoading || drivers.length === 0} sx={FILTER_WIDTH} />
          <FormSelect label="Situação" value={filters.status} onChange={(status) => applyFilters({ ...filters, status })} options={STATUS_OPTIONS} emptyLabel="Todas as situações" displayEmpty sx={FILTER_WIDTH} />
          <FormField label="Data inicial da infração" type="date" value={filters.from} onChange={(from) => applyFilters({ ...filters, from })} sx={FILTER_WIDTH} />
          <FormField label="Data final da infração" type="date" value={filters.to} onChange={(to) => applyFilters({ ...filters, to })} error={periodError} sx={FILTER_WIDTH} />
          <Button onClick={() => applyFilters({ ...EMPTY_FILTERS })} disabled={!filtersActive} sx={{ minHeight: 44 }}>Limpar filtros</Button>
        </FilterBar>
        {error && <StateFeedback kind="error" title={error.message} actionLabel="Tentar novamente" onAction={reload} />}
        {!error && !periodError && <DataTable caption="Histórico de multas" columns={columns} rows={items} rowKey={(fine) => fine.id} busy={loading} minWidth={1050}
          loadingContent={<StateFeedback kind="loading" title="Carregando multas..." />}
          emptyContent={<StateFeedback kind="empty" title={filtersActive ? 'Nenhuma multa encontrada com os filtros atuais.' : 'Nenhuma multa registrada.'} centered />} />}
        {formOpen && <FineFormDialog api={api} vehicles={vehicles} drivers={drivers} onCancel={(refreshHistory) => {
          setFormOpen(false)
          if (refreshHistory) reload()
        }} onSaved={() => {
          setFormOpen(false)
          setNotice('Multa registrada com sucesso.')
          reload()
        }} />}
        {statusChange && <FineStatusDialog api={api} {...statusChange} onCancel={() => setStatusChange(null)} onConflict={reload} onSaved={() => {
          setStatusChange(null)
          setNotice('Situação da multa atualizada.')
          reload()
        }} />}
      </>}
    </Box>
  )
}
