import { useEffect, useMemo, useState } from 'react'
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Typography } from '@mui/material'
import { useAuth } from '../../auth/useAuth'
import { resolveProfile } from '../../auth/profiles'
import DataTable from '../../components/ui/DataTable'
import type { DataTableColumn } from '../../components/ui/DataTable'
import FilterBar from '../../components/ui/FilterBar'
import { FormField, FormSelect } from '../../components/ui/FormField'
import PageHeader from '../../components/ui/PageHeader'
import StateFeedback from '../../components/ui/StateFeedback'
import StatusChip from '../../components/ui/StatusChip'
import { useMaintenance } from '../../hooks/useMaintenance'
import {
  canManageMaintenance, formatCivilDate, formatInstant, formatMoney, isActiveOrder,
  MAINTENANCE_TYPES, MAINTENANCE_STATUSES, TYPE_LABELS, STATUS_LABELS,
} from '../../maintenance/maintenanceTypes'
import type { MaintenanceFilters, MaintenanceOrder, MaintenanceStatus, MaintenanceType } from '../../maintenance/maintenanceTypes'
import MaintenanceFormDialog from './MaintenanceFormDialog'
import MaintenanceDetailDialog from './MaintenanceDetailDialog'
import { maintenanceControls } from './maintenanceStyles'

const COLUMNS: readonly DataTableColumn<MaintenanceOrder>[] = [
  { key: 'plate', header: 'Placa', render: order => <strong>{order.vehicleSnapshot?.licensePlate ?? `Veículo ${order.vehicleId}`}</strong> },
  { key: 'model', header: 'Modelo', render: order => order.vehicleSnapshot?.model ?? 'Não informado' },
  { key: 'type', header: 'Tipo', render: order => TYPE_LABELS[order.type] },
  { key: 'description', header: 'Descrição', render: order => order.description },
  { key: 'workshop', header: 'Oficina', render: order => order.workshop ?? 'Não informada' },
  { key: 'openedAt', header: 'Entrada', render: order => formatInstant(order.openedAt) },
  { key: 'expected', header: 'Previsão', render: order => formatCivilDate(order.expectedCompletionDate) },
  { key: 'estimate', header: 'Orçamento', render: order => formatMoney(order.estimatedTotal) },
  { key: 'cost', header: 'Custo final', render: order => formatMoney(order.finalCost) },
  { key: 'blocks', header: 'Impeditiva', render: order => order.blocksVehicle ? 'Sim' : 'Não' },
  { key: 'status', header: 'Situação', render: order => <StatusChip label={STATUS_LABELS[order.status]}
    tone={order.status === 'DONE' ? 'success' : isActiveOrder(order) ? 'warning' : 'neutral'} /> },
]

/** Lista ordens por entrada e gastos por encerramento, preservando os totais da API. */
export default function MaintenancePage() {
  const { api, session } = useAuth()
  const allowed = canManageMaintenance(session ? resolveProfile(session.perfil) : null)
  const [values, setValues] = useState({ vehicleId: '', type: '', status: '', from: '', to: '' })
  const [filters, setFilters] = useState<MaintenanceFilters>({})
  const [filterError, setFilterError] = useState('')
  const [form, setForm] = useState<{ order?: MaintenanceOrder } | null>(null)
  const [feedback, setFeedback] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const state = useMaintenance(api, filters)
  useEffect(() => {
    const previous = document.title
    document.title = 'Manutenção da Frota — Aratu'
    return () => { document.title = previous }
  }, [])
  const cards = useMemo(() => {
    const orders = state.data?.items ?? []
    return [
      ['Em aberto (entradas no período)', state.data ? String(orders.filter(isActiveOrder).length) : '—'],
      ['Concluídas (entradas no período)', state.data ? String(orders.filter(order => order.status === 'DONE').length) : '—'],
      ['Gasto com encerramentos no período', state.data ? formatMoney(state.data.totalSpent) : '—'],
      ['Impeditivas ativas (entradas no período)', state.data ? String(orders.filter(order => order.blocksVehicle && isActiveOrder(order)).length) : '—'],
    ]
  }, [state.data])
  function applyFilters() {
    if (values.from && values.to && new Date(values.from) >= new Date(values.to)) {
      setFilterError('O início do período deve anteceder o fim.'); return
    }
    setFilterError('')
    setFilters({ ...(values.vehicleId ? { vehicleId: values.vehicleId } : {}),
      ...(values.type ? { type: values.type as MaintenanceType } : {}),
      ...(values.status ? { status: values.status as MaintenanceStatus } : {}),
      ...(values.from ? { from: new Date(values.from).toISOString() } : {}),
      ...(values.to ? { to: new Date(values.to).toISOString() } : {}) })
    state.reload()
  }
  function select(id: string) { setSelectedId(id); void state.select(id) }
  function saved(order: MaintenanceOrder) {
    setForm(null); setSelectedId(order.id); state.saved(order)
    setFeedback(`Ordem #${order.id} ${order.status === 'DONE' ? 'encerrada' : 'salva'} com sucesso.`)
  }
  return <Box sx={{ minWidth: 0, ...maintenanceControls }}>
    <PageHeader title="Manutenção da Frota" breadcrumbs={['Início', 'Manutenção']}
      description="Registre a manutenção e acompanhe orçamento, execução e disponibilidade dos veículos."
      actions={allowed ? <Button variant="contained" onClick={() => setForm({})} disabled={state.vehicles.length === 0 || Boolean(state.vehiclesError)}>Registrar Manutenção</Button> : undefined} />
    {!allowed ? <StateFeedback kind="forbidden" title="Seu perfil não tem permissão para consultar manutenções." /> : <>
      {feedback && <Alert severity="success" role="status" sx={{ mb: 2 }}>{feedback}</Alert>}
      <FilterBar label="Filtros de manutenções">
        <Box sx={{ flex: { xs: 'none', md: '1 1 200px' }, minWidth: 0 }}><FormSelect label="Veículo" value={values.vehicleId} emptyLabel="Todos os veículos"
          options={state.vehicles.map(vehicle => ({ value: vehicle.id, label: vehicle.licensePlate }))} onChange={vehicleId => setValues({ ...values, vehicleId })} /></Box>
        <Box sx={{ flex: { xs: 'none', md: '1 1 160px' }, minWidth: 0 }}><FormSelect label="Tipo" value={values.type} emptyLabel="Todos os tipos"
          options={MAINTENANCE_TYPES.map(value => ({ value, label: TYPE_LABELS[value] }))} onChange={type => setValues({ ...values, type })} /></Box>
        <Box sx={{ flex: { xs: 'none', md: '1 1 170px' }, minWidth: 0 }}><FormSelect label="Situação" value={values.status} emptyLabel="Todas as situações"
          options={MAINTENANCE_STATUSES.map(value => ({ value, label: STATUS_LABELS[value] }))} onChange={status => setValues({ ...values, status })} /></Box>
        <Box sx={{ flex: { xs: 'none', md: '1 1 220px' }, minWidth: 0 }}><FormField label="Início do período" type="datetime-local" value={values.from}
          onChange={from => setValues({ ...values, from })} helperText="Horário local deste dispositivo." /></Box>
        <Box sx={{ flex: { xs: 'none', md: '1 1 220px' }, minWidth: 0 }}><FormField label="Fim do período" type="datetime-local" value={values.to}
          onChange={to => setValues({ ...values, to })} helperText="Limite final não incluído; horário local." /></Box>
        <Button variant="outlined" onClick={applyFilters}>Aplicar filtros</Button>
        <Button onClick={() => { setValues({ vehicleId: '', type: '', status: '', from: '', to: '' }); setFilters({}); setFilterError(''); state.reload() }}>Limpar filtros</Button>
        <Button onClick={state.reload}>Atualizar</Button>
      </FilterBar>
      {filterError && <Alert severity="error" role="alert" sx={{ mb: 2 }}>{filterError}</Alert>}
      {state.vehiclesError && <StateFeedback kind="partial" title={state.vehiclesError} actionLabel="Tentar novamente" onAction={state.reload} />}
      {state.loading && <StateFeedback kind="loading" title="Carregando manutenções..." />}
      {state.error && <StateFeedback kind={state.data ? 'partial' : 'error'} title={state.data ? 'Os dados exibidos podem estar desatualizados.' : state.error}
        description={state.data ? state.error : undefined} actionLabel="Tentar novamente" onAction={state.reload} />}
      {state.data && <>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(4, 1fr)' }, gap: 2, my: 3 }} aria-busy={state.loading}>
          {cards.map(([label, value]) => <Paper key={label} variant="outlined" sx={{ p: 2.5, minWidth: 0 }}>
            <Typography variant="body2">{label}</Typography><Typography variant="h5" component="p" sx={{ mt: 1, fontWeight: 700 }}>{value}</Typography>
          </Paper>)}
        </Box>
        <Typography variant="body2" sx={{ mb: 2 }}>A lista usa a data de entrada. O gasto considera o encerramento, mesmo de ordens abertas antes do período. Orçamentos não compõem o gasto.</Typography>
        {state.data.items.length === 0 ? <StateFeedback kind="empty" title="Nenhuma manutenção encontrada com os filtros atuais." />
          : <DataTable caption="Registros de manutenção — ordens abertas no período" columns={COLUMNS} rows={state.data.items} rowKey={order => order.id} busy={state.loading}
            renderActions={order => <Button variant="outlined" onClick={() => select(order.id)} aria-label={`Ver ordem ${order.id} do veículo ${order.vehicleSnapshot?.licensePlate ?? order.vehicleId}`}>Ver orçamento / ordem</Button>} />}
      </>}
      {form && <MaintenanceFormDialog api={api} order={form.order} vehicles={state.vehicles} onClose={() => setForm(null)} onSaved={saved}
        onConflict={() => { const order = form.order; setForm(null); if (order) select(order.id) }} />}
      {state.selection && !form && (state.selection.order ? <MaintenanceDetailDialog key={`${state.selection.order.id}-${state.selection.order.revision}`}
        order={state.selection.order} api={api} onClose={state.dismiss} onEdit={() => setForm({ order: state.selection!.order! })}
        onSaved={saved} onReload={() => { if (selectedId) select(selectedId) }} />
        : <Dialog open onClose={state.dismiss} fullWidth aria-labelledby="maintenance-detail-title">
          <DialogTitle id="maintenance-detail-title">Consultar manutenção</DialogTitle><DialogContent>
            <StateFeedback kind={state.selection.loading ? 'loading' : 'error'} title={state.selection.loading ? 'Carregando ordem...' : state.selection.error}
              actionLabel={state.selection.loading ? undefined : 'Tentar novamente'} onAction={state.selection.loading ? undefined : () => { if (selectedId) select(selectedId) }} />
          </DialogContent><DialogActions><Button onClick={state.dismiss}>Fechar</Button></DialogActions>
        </Dialog>)}
    </>}
  </Box>
}
