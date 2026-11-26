import { useEffect, useMemo, useState } from 'react'
import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Stack, Typography } from '@mui/material'
import PersonAddAlt1 from '@mui/icons-material/PersonAddAlt1'
import EditOutlined from '@mui/icons-material/EditOutlined'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ReplayOutlined from '@mui/icons-material/ReplayOutlined'
import { useAuth } from '../../auth/useAuth'
import { hasPermission } from '../../auth/access'
import PageHeader from '../../components/ui/PageHeader'
import FilterBar from '../../components/ui/FilterBar'
import { FormField, FormSelect } from '../../components/ui/FormField'
import DataTable from '../../components/ui/DataTable'
import type { DataTableColumn } from '../../components/ui/DataTable'
import RowActionsMenu from '../../components/ui/RowActionsMenu'
import type { RowActionItem } from '../../components/ui/RowActionsMenu'
import StateFeedback from '../../components/ui/StateFeedback'
import StatusChip from '../../components/ui/StatusChip'
import { cnhValidity, formatIsoDate } from '../../drivers/driverForm'
import { DRIVER_STATUS_LABELS, DRIVER_STATUS_OPTIONS, DRIVER_STATUS_TONES } from '../../drivers/driverStatus'
import { CNH_CATEGORIES } from '../../drivers/driverTypes'
import type { Driver, DriverStatus, DriverPage } from '../../drivers/driverTypes'
import { getDriver, listDriverPage, listDrivers } from '../../services/driversService'
import DriverDetailsDialog from './DriverDetailsDialog'
import DriverFormDialog from './DriverFormDialog'
import DriverStatusDialog from './DriverStatusDialog'
import styles from './DriversPage.module.css'

type FormDialogState = { mode: 'create' } | { mode: 'edit'; driver: Driver }
type StatusDialogState = { driver: Driver; mode: 'archive' | 'restore' | 'reactivate' }
const PAGE_SIZE = 20
const VIEW_OPTIONS = [
  { value: 'operational', label: 'Em operação' },
  { value: 'archived', label: 'Arquivados' },
  { value: 'all', label: 'Todos' },
]
const CATEGORY_OPTIONS = CNH_CATEGORIES.map((category) => ({ value: category, label: category }))

/** Lista motoristas em páginas de servidor e mantém ações secundárias em menu. */
export default function DriversPage() {
  const { api, session } = useAuth()
  const allowed = hasPermission(session, 'drivers:read')
  const canCreate = hasPermission(session, 'drivers:create')
  const canUpdate = hasPermission(session, 'drivers:update')
  const canChangeStatus = hasPermission(session, 'drivers:status:change')
  const canArchive = hasPermission(session, 'drivers:archive')
  const canLinkAccount = hasPermission(session, 'users:read')
  const reportedBy = session?.nome ?? ''
  const [drivers, setDrivers] = useState<DriverPage | null>(null)
  const [linkDrivers, setLinkDrivers] = useState<Driver[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [refreshToken, setRefreshToken] = useState(0)
  const [search, setSearch] = useState('')
  const [view, setView] = useState<'operational' | 'archived' | 'all'>('operational')
  const [statusFilter, setStatusFilter] = useState<DriverStatus | ''>('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [page, setPage] = useState(1)
  const [formDialog, setFormDialog] = useState<FormDialogState | null>(null)
  const [statusDialog, setStatusDialog] = useState<StatusDialogState | null>(null)
  const [details, setDetails] = useState<{ driver: Driver | null; loading: boolean; error: string } | null>(null)
  const [notice, setNotice] = useState('')

  const filtersActive = Boolean(search.trim() || view !== 'operational' || statusFilter || categoryFilter)
  const statusOptions = DRIVER_STATUS_OPTIONS
  const filters = useMemo(() => ({
    view,
    page,
    pageSize: PAGE_SIZE,
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(categoryFilter ? { cnhCategory: categoryFilter as Driver['cnhCategory'] } : {}),
  }), [categoryFilter, page, search, statusFilter, view])

  useEffect(() => {
    if (!allowed) return
    let current = true
    void listDriverPage(api, filters)
      .then((result) => { if (current) setDrivers(result) })
      .catch((error: unknown) => { if (current) setLoadError(error instanceof Error ? error.message : 'Não foi possível carregar os motoristas.') })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [allowed, api, filters, refreshToken])

  useEffect(() => {
    if (!canLinkAccount) return
    let current = true
    void listDrivers(api)
      .then((result) => { if (current) setLinkDrivers(result) })
      .catch(() => { if (current) setLinkDrivers([]) })
    return () => { current = false }
  }, [api, canLinkAccount, refreshToken])

  const reload = () => {
    setLoading(true)
    setLoadError('')
    setRefreshToken((value) => value + 1)
  }

  function clearFilters() {
    setSearch('')
    setView('operational')
    setStatusFilter('')
    setCategoryFilter('')
    setPage(1)
    reload()
  }

  async function openDetails(driver: Driver) {
    setDetails({ driver, loading: true, error: '' })
    try {
      const result = await getDriver(api, driver.id)
      setDetails({ driver: result, loading: false, error: '' })
    } catch (error) {
      setDetails({ driver, loading: false, error: error instanceof Error ? error.message : 'Não foi possível consultar o motorista.' })
    }
  }

  function handleSaved(saved: Driver) {
    const mode = statusDialog?.mode
    setFormDialog(null)
    setStatusDialog(null)
    setNotice(mode === 'archive'
      ? `Motorista ${saved.name} arquivado.`
      : mode === 'restore'
        ? `Motorista ${saved.name} restaurado.`
        : mode === 'reactivate'
          ? `Motorista ${saved.name} voltou à situação ativa.`
          : formDialog?.mode === 'edit' ? 'Motorista atualizado com sucesso.' : 'Motorista cadastrado com sucesso.')
    reload()
  }

  const formDialogCommon = {
    api,
    drivers: linkDrivers,
    canLinkAccount,
    reportedBy,
    onSaved: handleSaved,
    onCancel: () => setFormDialog(null),
  }

  const columns: readonly DataTableColumn<Driver>[] = [
    {
      key: 'name', header: 'Motorista', width: '42%', render: (driver) => <Button
        variant="text" onClick={() => void openDetails(driver)} aria-label={`Ver detalhes de ${driver.name}`}
        sx={{ minHeight: 44, px: 0, textTransform: 'none', fontWeight: 600, justifyContent: 'flex-start' }}
      >{driver.name}</Button>,
    },
    {
      key: 'cnhExpiresAt', header: 'Validade da CNH', width: '34%', render: (driver) => {
        const validity = cnhValidity(driver.cnhExpiresAt)
        return <Stack spacing={0.25}>
          <Typography color={validity === 'expired' ? 'error.main' : 'text.primary'} sx={{ fontWeight: validity === 'valid' ? 400 : 700 }}>{formatIsoDate(driver.cnhExpiresAt)}</Typography>
          {validity !== 'valid' && <Typography variant="caption" color={validity === 'expired' ? 'error.main' : 'warning.dark'} sx={{ fontWeight: 700 }}>{validity === 'expired' ? 'CNH vencida' : 'Vence em até 30 dias'}</Typography>}
        </Stack>
      },
    },
    { key: 'status', header: 'Situação', width: '24%', render: (driver) => <StatusChip label={DRIVER_STATUS_LABELS[driver.status]} tone={DRIVER_STATUS_TONES[driver.status]} /> },
  ]

  return (
    <Box className={styles.page}>
      <PageHeader title="Motoristas" actions={canCreate ? <Button variant="contained" startIcon={<PersonAddAlt1 aria-hidden="true" />} onClick={() => setFormDialog({ mode: 'create' })} sx={{ minHeight: 44 }}>Cadastrar motorista</Button> : undefined} />
      {!allowed && <StateFeedback kind="forbidden" />}
      {allowed && <>
        {notice && <Alert severity="success" role="status" onClose={() => setNotice('')} sx={{ mb: 2 }}>{notice}</Alert>}
        <FilterBar label="Buscar motoristas">
          <Box sx={{ flex: '1 1 280px', minWidth: { xs: '100%', sm: 260 } }}>
            <FormField label="Buscar pelo nome" value={search} onChange={(value) => { setSearch(value); setPage(1); setLoading(true); setLoadError('') }} placeholder="Nome do motorista" />
          </Box>
          <Box sx={{ width: { xs: '100%', sm: 190 } }}>
            <FormSelect label="Atividade" value={view} onChange={(value) => { setView(value as typeof view); setPage(1); setLoading(true); setLoadError('') }} options={VIEW_OPTIONS} />
          </Box>
          {filtersActive && <Button color="inherit" onClick={clearFilters} sx={{ minHeight: 44 }}>Limpar filtros</Button>}
        </FilterBar>
        <Accordion disableGutters elevation={0} sx={{ mb: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1, '&:before': { display: 'none' } }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon aria-hidden="true" />} aria-controls="driver-more-filters" id="driver-more-filters-heading" sx={{ minHeight: 52 }}>
            <Typography>Mais filtros{statusFilter || categoryFilter ? ' · aplicados' : ''}</Typography>
          </AccordionSummary>
          <AccordionDetails id="driver-more-filters">
            <FilterBar label="Filtros complementares">
              <Box sx={{ width: { xs: '100%', sm: 220 } }}>
                <FormSelect label="Situação específica" value={statusFilter} onChange={(value) => {
                  const status = value as DriverStatus | ''
                  setStatusFilter(status)
                  setPage(1)
                  setLoading(true)
                  setLoadError('')
                  if (status === 'INACTIVE') setView('archived')
                  else if (status && view === 'archived') setView('all')
                }} options={statusOptions} emptyLabel="Todas as situações" displayEmpty />
              </Box>
              <Box sx={{ width: { xs: '100%', sm: 200 } }}>
                <FormSelect label="Categoria da CNH" value={categoryFilter} onChange={(value) => { setCategoryFilter(value); setPage(1); setLoading(true); setLoadError('') }} options={CATEGORY_OPTIONS} emptyLabel="Todas as categorias" displayEmpty />
              </Box>
            </FilterBar>
          </AccordionDetails>
        </Accordion>
        {loadError && <StateFeedback kind="error" title={loadError} actionLabel="Tentar novamente" onAction={reload} />}
        {!loadError && loading && drivers === null && <StateFeedback kind="loading" title="Carregando motoristas…" />}
        {allowed && !loadError && drivers !== null && <>
          <DataTable
            caption="Motoristas"
            columns={columns}
            rows={drivers.items}
            rowKey={(driver) => driver.id}
            busy={loading}
            minWidth={640}
            actionsWidth={64}
            paperSx={{ borderRadius: 2 }}
            emptyContent={!loading ? <StateFeedback kind="empty" title={filtersActive ? 'Nenhum motorista encontrado' : 'Nenhum motorista cadastrado'} description={filtersActive ? 'Ajuste a busca ou os filtros para consultar outros motoristas.' : 'Cadastre o primeiro motorista.'} centered /> : undefined}
            renderActions={canUpdate || canChangeStatus || canArchive ? (driver) => {
              const actions: RowActionItem[] = [
                ...(canUpdate ? [{ key: 'edit', label: 'Editar cadastro', icon: <EditOutlined fontSize="small" />, onSelect: () => setFormDialog({ mode: 'edit', driver }) }] : []),
                ...(canChangeStatus && driver.status === 'AWAY' ? [{ key: 'reactivate', label: 'Ativar motorista', icon: <ReplayOutlined fontSize="small" />, onSelect: () => setStatusDialog({ driver, mode: 'reactivate' }) }] : []),
                ...(canArchive ? [driver.status === 'INACTIVE'
                  ? { key: 'restore', label: 'Restaurar', onSelect: () => setStatusDialog({ driver, mode: 'restore' }) }
                  : { key: 'archive', label: 'Arquivar', danger: true, onSelect: () => setStatusDialog({ driver, mode: 'archive' }) }] : []),
              ]
              return actions.length > 0 ? <RowActionsMenu label={`Ações do motorista ${driver.name}`} actions={actions} /> : null
            } : undefined}
          />
          <Stack component="nav" aria-label="Paginação de motoristas" direction="row" sx={{ mt: 2, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
            <Typography variant="body2" color="text.secondary">{drivers.total} motorista(s)</Typography>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <Button color="inherit" disabled={drivers.page <= 1 || loading} onClick={() => { setPage((current) => Math.max(1, current - 1)); setLoading(true) }} sx={{ minHeight: 44 }}>Anterior</Button>
              <Typography role="status">Página {drivers.page} de {Math.max(1, drivers.totalPages)}</Typography>
              <Button color="inherit" disabled={drivers.page >= drivers.totalPages || loading} onClick={() => { setPage((current) => current + 1); setLoading(true) }} sx={{ minHeight: 44 }}>Próxima</Button>
            </Stack>
          </Stack>
        </>}
      </>}
      {formDialog?.mode === 'edit' && <DriverFormDialog key={formDialog.driver.id} {...formDialogCommon} mode="edit" driver={formDialog.driver} />}
      {formDialog?.mode === 'create' && <DriverFormDialog key="create" {...formDialogCommon} mode="create" />}
      {statusDialog && <DriverStatusDialog
        key={`${statusDialog.driver.id}-${statusDialog.mode}`}
        api={api}
        driver={statusDialog.driver}
        mode={statusDialog.mode}
        reportedBy={reportedBy}
        onSaved={handleSaved}
        onCancel={() => setStatusDialog(null)}
      />}
      {details?.driver && <DriverDetailsDialog
        driver={details.driver}
        loading={details.loading}
        error={details.error}
        onRetry={() => { if (details?.driver) void openDetails(details.driver) }}
        onClose={() => setDetails(null)}
      />}
    </Box>
  )
}
