import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Box,
  Button,
  IconButton,
  Paper,
  Stack,
  Typography,
} from '@mui/material'
import PersonAddAlt1 from '@mui/icons-material/PersonAddAlt1'
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined'
import EditOutlined from '@mui/icons-material/EditOutlined'
import BlockOutlined from '@mui/icons-material/BlockOutlined'
import ReplayOutlined from '@mui/icons-material/ReplayOutlined'
import { useAuth } from '../auth/useAuth'
import { resolveProfile } from '../auth/profiles'
import PageHeader from '../components/ui/PageHeader'
import FilterBar from '../components/ui/FilterBar'
import { FormField, FormSelect } from '../components/ui/FormField'
import DataTable from '../components/ui/DataTable'
import type { DataTableColumn } from '../components/ui/DataTable'
import StateFeedback from '../components/ui/StateFeedback'
import StatusChip from '../components/ui/StatusChip'
import { canReadDrivers, canWriteDrivers } from '../drivers/driverAccess'
import { cnhValidity, formatIsoDate } from '../drivers/driverForm'
import { DRIVER_STATUS_LABELS, DRIVER_STATUS_OPTIONS, DRIVER_STATUS_TONES } from '../drivers/driverStatus'
import { CNH_CATEGORIES } from '../drivers/driverTypes'
import type { Driver, DriverStatus } from '../drivers/driverTypes'
import { getDriver, listDrivers } from '../services/driversService'
import DriverDetailsDialog from './driversPage/DriverDetailsDialog'
import DriverFormDialog from './driversPage/DriverFormDialog'
import DriverStatusDialog from './driversPage/DriverStatusDialog'
import styles from './DriversPage.module.css'

type FormDialogState = { mode: 'create' } | { mode: 'edit'; driver: Driver }

const PAGE_SIZE = 10
const CATEGORY_OPTIONS = CNH_CATEGORIES
  .map((category) => ({ value: category, label: category }))

const DRIVER_COLUMNS: readonly DataTableColumn<Driver>[] = [
  {
    key: 'name',
    header: 'Motorista',
    width: 220,
    render: (driver) => <Typography sx={{ color: 'text.primary', fontWeight: 600 }}>{driver.name}</Typography>,
  },
  { key: 'cnhNumber', header: 'CNH', width: 170, render: (driver) => driver.cnhNumber },
  {
    key: 'cnhExpiresAt',
    header: 'Validade CNH',
    width: 190,
    render: (driver) => {
      const validity = cnhValidity(driver.cnhExpiresAt)
      return (
        <Stack spacing={0.25}>
          <Typography color={validity === 'expired' ? 'error.main' : 'text.primary'} sx={{ fontWeight: validity === 'valid' ? 400 : 700 }}>
            {formatIsoDate(driver.cnhExpiresAt)}
          </Typography>
          {validity !== 'valid' && (
            <Typography
              variant="caption"
              color={validity === 'expired' ? 'error.main' : 'warning.dark'}
              sx={{ fontWeight: 700 }}
            >
              {validity === 'expired' ? 'CNH vencida' : 'Vence em até 30 dias'}
            </Typography>
          )}
        </Stack>
      )
    },
  },
  { key: 'cnhCategory', header: 'Categoria', width: 120, render: (driver) => driver.cnhCategory },
  {
    key: 'status',
    header: 'Status',
    width: 140,
    render: (driver) => <StatusChip label={DRIVER_STATUS_LABELS[driver.status]} tone={DRIVER_STATUS_TONES[driver.status]} />,
  },
]

function normalizeSearch(value: string): string {
  return value.trim().toLocaleLowerCase('pt-BR')
}

/** Tela de consulta e gerenciamento de motoristas integrada à API FROTA-49. */
export default function DriversPage() {
  const { api, session } = useAuth()
  const profile = session ? resolveProfile(session.perfil) : null
  const allowed = canReadDrivers(profile)
  const canWrite = canWriteDrivers(profile)
  /**
   * O vínculo de conta depende de `GET /users`, restrito por RBAC a ADMINISTRADOR.
   * Por isso o seletor só aparece para esse perfil, mesmo que o Gestor possa
   * gravar o motorista com `userId` pela API de motoristas.
   */
  const canLinkAccount = profile === 'ADMINISTRADOR'
  const reportedBy = session?.nome ?? ''

  const [drivers, setDrivers] = useState<Driver[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [refreshToken, setRefreshToken] = useState(0)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<DriverStatus | ''>('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [page, setPage] = useState(1)
  const [formDialog, setFormDialog] = useState<FormDialogState | null>(null)
  const [statusDriver, setStatusDriver] = useState<Driver | null>(null)
  const [details, setDetails] = useState<{ driver: Driver | null; loading: boolean; error: string } | null>(null)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (!allowed) return
    let current = true
    void listDrivers(api, statusFilter ? { status: statusFilter } : {})
      .then((result) => {
        if (current) setDrivers(result)
      })
      .catch((error: unknown) => {
        if (!current) return
        setLoadError(error instanceof Error ? error.message : 'Não foi possível carregar os motoristas.')
      })
      .finally(() => {
        if (current) setLoading(false)
      })
    return () => { current = false }
  }, [allowed, api, refreshToken, statusFilter])

  const filtersActive = Boolean(search.trim() || statusFilter || categoryFilter)
  const visibleDrivers = useMemo(() => {
    if (!drivers) return []
    const term = normalizeSearch(search)
    return drivers.filter((driver) => (
      (!term || normalizeSearch(driver.name).includes(term) || driver.cnhNumber.toLocaleLowerCase().includes(term))
      && (!categoryFilter || driver.cnhCategory === categoryFilter)
    ))
  }, [categoryFilter, drivers, search])
  const totalPages = Math.max(1, Math.ceil(visibleDrivers.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageDrivers = visibleDrivers.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const reload = useCallback(() => {
    setLoading(true)
    setLoadError('')
    setRefreshToken((current) => current + 1)
  }, [])

  function clearFilters() {
    setSearch('')
    setStatusFilter('')
    setCategoryFilter('')
    setPage(1)
    // Sempre refaz a consulta: quando a situação já era vazia, mudar apenas busca
    // ou categoria não altera as dependências do efeito e deixaria `loading` preso.
    reload()
  }

  async function openDetails(driver: Driver) {
    setDetails({ driver, loading: true, error: '' })
    try {
      const result = await getDriver(api, driver.id)
      setDetails({ driver: result, loading: false, error: '' })
    } catch (error) {
      setDetails({
        driver,
        loading: false,
        error: error instanceof Error ? error.message : 'Não foi possível consultar o motorista.',
      })
    }
  }

  function handleSaved(saved: Driver) {
    const fromForm = formDialog !== null
    const wasEdit = formDialog?.mode === 'edit'
    setFormDialog(null)
    setStatusDriver(null)
    setNotice(fromForm
      ? wasEdit ? 'Motorista atualizado com sucesso.' : 'Motorista cadastrado com sucesso.'
      : `Situação alterada para ${DRIVER_STATUS_LABELS[saved.status]}.`)
    reload()
  }

  const formDialogCommon = {
    api,
    drivers: drivers ?? [],
    canLinkAccount,
    reportedBy,
    onSaved: handleSaved,
    onCancel: () => setFormDialog(null),
  }

  return (
    <Box className={styles.page}>
      <PageHeader
        title="Motoristas"
        titleVariant="h4"
        titleSx={{ color: '#0f172a', fontSize: { xs: '1.5rem', sm: '2rem' } }}
        breadcrumbs={['Início', 'Motoristas']}
        breadcrumbsSx={{ mb: 2, color: '#64748b', fontSize: '0.85rem' }}
        actions={canWrite
          ? (
              <Button
                variant="contained"
                startIcon={<PersonAddAlt1 aria-hidden="true" />}
                onClick={() => setFormDialog({ mode: 'create' })}
                sx={{ minHeight: 44, backgroundColor: '#ff6b00', '&:hover': { backgroundColor: '#e85d00' } }}
              >
                Cadastrar Motorista
              </Button>
            )
          : undefined}
      />

      {!allowed && <StateFeedback kind="forbidden" />}

      {allowed && (
        <>
          {notice && (
            <Paper role="status" sx={{ mb: 2, p: 1.5, color: 'success.dark', backgroundColor: 'success.light' }}>
              {notice}
            </Paper>
          )}
          <Paper elevation={0} sx={{ borderRadius: 2, backgroundColor: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
            <FilterBar
              label="Filtros de motoristas"
              sx={{ p: 2.5, mb: 0, border: 0, borderRadius: 0, borderBottom: '1px solid #e2e8f0', boxShadow: 'none' }}
            >
              <Box sx={{ flex: '1 1 240px', minWidth: { xs: '100%', sm: 240 } }}>
                <FormField
                  label="Buscar motoristas por nome ou CNH"
                  hideLabel
                  value={search}
                  onChange={(value) => { setSearch(value); setPage(1) }}
                  placeholder="Nome ou CNH..."
                />
              </Box>
              <Box sx={{ width: { xs: '100%', sm: 190 } }}>
                <FormSelect
                  label="Filtrar por situação"
                  hideLabel
                  value={statusFilter}
                  onChange={(value) => { setStatusFilter(value as DriverStatus | ''); setPage(1); setLoading(true); setLoadError('') }}
                  options={DRIVER_STATUS_OPTIONS}
                  emptyLabel="Todos os status"
                  displayEmpty
                />
              </Box>
              <Box sx={{ width: { xs: '100%', sm: 150 } }}>
                <FormSelect
                  label="Filtrar por categoria da CNH"
                  hideLabel
                  value={categoryFilter}
                  onChange={(value) => { setCategoryFilter(value); setPage(1) }}
                  options={CATEGORY_OPTIONS}
                  emptyLabel="Categoria CNH"
                  displayEmpty
                />
              </Box>
              {filtersActive && (
                <Button onClick={clearFilters} sx={{ minHeight: 44, color: '#1e293b' }}>
                  Limpar filtros
                </Button>
              )}
            </FilterBar>

            {loadError && (
              <StateFeedback
                kind="error"
                title={loadError}
                sx={{ m: 2, borderRadius: 1 }}
                actionLabel="Tentar novamente"
                onAction={reload}
              />
            )}
            {!loadError && loading && drivers === null && <StateFeedback kind="loading" title="Carregando motoristas..." />}

            {allowed && !loadError && drivers !== null && (
              <>
                <DataTable
                  caption="Motoristas cadastrados"
                  columns={DRIVER_COLUMNS}
                  rows={pageDrivers}
                  rowKey={(driver) => driver.id}
                  busy={loading}
                  loadingContent={<StateFeedback kind="loading" title="Atualizando motoristas..." />}
                  emptyContent={(
                    <StateFeedback
                      kind="empty"
                      title={filtersActive ? 'Nenhum motorista encontrado' : 'Nenhum motorista cadastrado'}
                      description={filtersActive
                        ? 'Ajuste os filtros ou limpe a busca para ver outros motoristas.'
                        : 'Cadastre o primeiro motorista para iniciar a gestão da frota.'}
                      centered
                      actionLabel={filtersActive ? 'Limpar filtros' : undefined}
                      onAction={filtersActive ? clearFilters : undefined}
                    />
                  )}
                  minWidth={1040}
                  tableLayout="fixed"
                  actionsWidth={220}
                  containerClassName={styles.tableContainer}
                  paperSx={{ border: 0, boxShadow: 'none', borderRadius: 0 }}
                  headerCellSx={{ backgroundColor: '#f8fafc', color: '#64748b', fontSize: '0.8rem', py: 1.75 }}
                  renderActions={(driver) => (
                    <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end' }}>
                      <IconButton
                        aria-label={`Consultar detalhes de ${driver.name}`}
                        onClick={() => void openDetails(driver)}
                        sx={{ width: 44, height: 44 }}
                      >
                        <VisibilityOutlined aria-hidden="true" />
                      </IconButton>
                      <IconButton
                        aria-label={`Editar ${driver.name}`}
                        onClick={() => setFormDialog({ mode: 'edit', driver })}
                        disabled={!canWrite}
                        sx={{ width: 44, height: 44 }}
                      >
                        <EditOutlined aria-hidden="true" />
                      </IconButton>
                      <IconButton
                        aria-label={`${driver.status === 'ACTIVE' ? 'Inativar' : 'Reativar'} ${driver.name}`}
                        onClick={() => setStatusDriver(driver)}
                        disabled={!canWrite}
                        sx={{ width: 44, height: 44, color: driver.status === 'ACTIVE' ? 'error.main' : 'success.main' }}
                      >
                        {driver.status === 'ACTIVE'
                          ? <BlockOutlined aria-hidden="true" />
                          : <ReplayOutlined aria-hidden="true" />}
                      </IconButton>
                    </Stack>
                  )}
                />
                <Box
                  sx={{ px: 2.5, py: 1.75, borderTop: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1.5 }}
                >
                  <Typography variant="body2" color="text.secondary">
                    {visibleDrivers.length === 0 ? 'Nenhum registro' : `${visibleDrivers.length} motorista(s) encontrado(s)`}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Button
                      size="small"
                      onClick={() => setPage((current) => Math.max(1, current - 1))}
                      disabled={currentPage <= 1 || loading}
                      sx={{ minHeight: 44 }}
                    >
                      Anterior
                    </Button>
                    <Typography variant="body2" color="text.secondary">
                      Página {currentPage} de {totalPages}
                    </Typography>
                    <Button
                      size="small"
                      onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                      disabled={currentPage >= totalPages || loading}
                      sx={{ minHeight: 44 }}
                    >
                      Próxima
                    </Button>
                  </Box>
                </Box>
              </>
            )}
          </Paper>
        </>
      )}

      {formDialog?.mode === 'edit' && (
        <DriverFormDialog
          key={formDialog.driver.id}
          {...formDialogCommon}
          mode="edit"
          driver={formDialog.driver}
        />
      )}
      {formDialog?.mode === 'create' && (
        <DriverFormDialog key="create" {...formDialogCommon} mode="create" />
      )}
      {statusDriver && (
        <DriverStatusDialog
          key={statusDriver.id}
          api={api}
          driver={statusDriver}
          reportedBy={reportedBy}
          onSaved={handleSaved}
          onCancel={() => setStatusDriver(null)}
        />
      )}
      {details?.driver && (
        <DriverDetailsDialog
          driver={details.driver}
          loading={details.loading}
          error={details.error}
          onRetry={() => { if (details?.driver) void openDetails(details.driver) }}
          onClose={() => setDetails(null)}
        />
      )}
    </Box>
  )
}
