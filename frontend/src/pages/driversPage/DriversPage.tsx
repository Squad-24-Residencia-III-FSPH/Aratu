import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
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
import HistoryOutlined from '@mui/icons-material/HistoryOutlined'
import { useAuth } from '../../auth/useAuth'
import { resolveProfile } from '../../auth/profiles'
import { accessibleControls } from '../../components/ui/accessibleControls'
import PageHeader from '../../components/ui/PageHeader'
import FilterBar from '../../components/ui/FilterBar'
import { FormField, FormSelect } from '../../components/ui/FormField'
import DataTable from '../../components/ui/DataTable'
import type { DataTableColumn } from '../../components/ui/DataTable'
import StateFeedback from '../../components/ui/StateFeedback'
import StatusChip from '../../components/ui/StatusChip'
import { canReadDrivers, canWriteDrivers } from '../../drivers/driverAccess'
import { cnhValidity, formatIsoDate } from '../../drivers/driverForm'
import { DRIVER_STATUS_LABELS, DRIVER_STATUS_OPTIONS, DRIVER_STATUS_TONES } from '../../drivers/driverStatus'
import { CNH_CATEGORIES, DriverRequestError } from '../../drivers/driverTypes'
import type { Driver, DriverStatus } from '../../drivers/driverTypes'
import { getDriver, listDrivers } from '../../services/driversService'
import type { DriverDetails } from '../../services/driversService'
import { sanitizeCpfFromMessage } from './driverFormHelper'
import DriverDetailsDialog from './DriverDetailsDialog'
import DriverFormDialog from './DriverFormDialog'
import DriverStatusDialog from './DriverStatusDialog'
import EntityHistoryDialog from '../../components/ui/EntityHistoryDialog'
import { listDriverHistory } from '../../services/entityHistoryService'
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
   * O vínculo consome `GET /drivers/eligible-accounts` (autorizado para GESTOR e ADMINISTRADOR),
   * mantendo `/users` restrito ao ADMINISTRADOR.
   */
  const canLinkAccount = canWrite
  const reportedBy = session?.nome ?? ''

  const [drivers, setDrivers] = useState<Driver[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [forbiddenByApi, setForbiddenByApi] = useState(false)
  const [refreshToken, setRefreshToken] = useState(0)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<DriverStatus | ''>('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [page, setPage] = useState(1)
  const [formDialog, setFormDialog] = useState<FormDialogState | null>(null)
  const [statusDriver, setStatusDriver] = useState<Driver | null>(null)
  const [details, setDetails] = useState<{ driver: DriverDetails | null; loading: boolean; error: string } | null>(null)
  const [historyDriver, setHistoryDriver] = useState<Driver | null>(null)
  const loadDriverHistory = useCallback((historyPage: number) => {
    if (!historyDriver) return Promise.reject(new Error('Selecione um motorista para consultar o histórico.'))
    return listDriverHistory(api, historyDriver.id, historyPage)
  }, [api, historyDriver])
  const [notice, setNotice] = useState('')

  const detailsSeqRef = useRef(0)
  const detailsRequestRef = useRef<{ id: number; controller: AbortController } | null>(null)
  const previousTitleRef = useRef<string | null>(null)

  useLayoutEffect(() => {
    previousTitleRef.current = document.title
  }, [])

  useEffect(() => {
    const previousTitle = previousTitleRef.current ?? document.title
    document.title = 'Motoristas — Aratu'
    return () => {
      document.title = previousTitle
    }
  }, [])

  useEffect(() => () => {
    detailsRequestRef.current?.controller.abort()
    detailsRequestRef.current = null
  }, [])

  useEffect(() => {
    if (!allowed) return
    let current = true
    const controller = new AbortController()
    void listDrivers(api, statusFilter ? { status: statusFilter } : {}, { signal: controller.signal })
      .then((result) => {
        if (!current || controller.signal.aborted) return
        setForbiddenByApi(false)
        setDrivers(result)
      })
      .catch((error: unknown) => {
        if (!current || controller.signal.aborted) return
        if (error instanceof DriverRequestError && error.kind === 'forbidden') {
          setForbiddenByApi(true)
          setLoadError('')
          return
        }
        const raw = error instanceof Error ? error.message : 'Não foi possível carregar os motoristas.'
        setLoadError(sanitizeCpfFromMessage(raw))
      })
      .finally(() => {
        if (current && !controller.signal.aborted) setLoading(false)
      })
    return () => {
      current = false
      controller.abort()
    }
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
    setForbiddenByApi(false)
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

  function closeDetails() {
    detailsRequestRef.current?.controller.abort()
    detailsRequestRef.current = null
    setDetails(null)
  }

  async function openDetails(driver: Driver) {
    detailsRequestRef.current?.controller.abort()
    const requestId = detailsSeqRef.current + 1
    detailsSeqRef.current = requestId
    const controller = new AbortController()
    detailsRequestRef.current = { id: requestId, controller }

    setDetails({ driver, loading: true, error: '' })
    try {
      const result = await getDriver(api, driver.id, { signal: controller.signal })
      if (detailsRequestRef.current?.id !== requestId || controller.signal.aborted) return
      setDetails({ driver: result, loading: false, error: '' })
    } catch (error) {
      if (detailsRequestRef.current?.id !== requestId || controller.signal.aborted) return
      const raw = error instanceof Error ? error.message : 'Não foi possível consultar o motorista.'
      setDetails({
        driver,
        loading: false,
        error: sanitizeCpfFromMessage(raw),
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
    canLinkAccount,
    reportedBy,
    onSaved: handleSaved,
    onCancel: () => setFormDialog(null),
  }

  const accessDenied = !allowed || forbiddenByApi

  return (
    <Box className={styles.page} sx={{ minWidth: 0, ...accessibleControls }}>
      <PageHeader
        title="Motoristas"
        breadcrumbs={['Início', 'Motoristas']}
        breadcrumbsSx={{ mb: { xs: 1, sm: 2 }, color: '#475569', fontSize: '0.85rem' }}
        sx={{ mb: { xs: 1.5, sm: 2.5 } }}
        actions={canWrite && !forbiddenByApi
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

      {accessDenied && <StateFeedback kind="forbidden" title="Seu perfil não tem permissão para consultar motoristas." />}

      {!accessDenied && (
        <>
          {notice && (
            <Alert severity="success" role="status" onClose={() => setNotice('')} sx={{ mb: 2 }}>
              {notice}
            </Alert>
          )}
          <Paper elevation={0} sx={{ borderRadius: 2, backgroundColor: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
            <FilterBar
              label="Filtros de motoristas"
              sx={{ p: { xs: 1.5, sm: 2.5 }, mb: 0, border: 0, borderRadius: 0, borderBottom: '1px solid #e2e8f0', boxShadow: 'none' }}
            >
              <Box sx={{ flex: { xs: '0 0 auto', md: '1 1 240px' }, minWidth: 0, width: { xs: '100%', md: 'auto' } }}>
                <FormField
                  label="Buscar motoristas por nome ou CNH"
                  hideLabel
                  value={search}
                  onChange={(value) => { setSearch(value); setPage(1) }}
                  placeholder="Nome ou CNH..."
                />
              </Box>
              <Box sx={{ flex: { xs: '0 0 auto', md: '0 1 190px' }, minWidth: 0, width: { xs: '100%', md: 'auto' } }}>
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
              <Box sx={{ flex: { xs: '0 0 auto', md: '0 1 150px' }, minWidth: 0, width: { xs: '100%', md: 'auto' } }}>
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
                <Button onClick={clearFilters} sx={{ minHeight: 44, width: { xs: '100%', md: 'auto' }, color: '#1e293b' }}>
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

            {!loadError && drivers !== null && (
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
                  headerCellSx={{ backgroundColor: '#f8fafc', color: '#475569', fontSize: '0.8rem', py: 1.75 }}
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
                        aria-label={`Consultar histórico de ${driver.name}`}
                        onClick={() => setHistoryDriver(driver)}
                        sx={{ width: 44, height: 44 }}
                      >
                        <HistoryOutlined aria-hidden="true" />
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
                  sx={{ px: { xs: 1.5, sm: 2.5 }, py: 1.5, borderTop: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1.5 }}
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
          onClose={closeDetails}
        />
      )}
      {historyDriver && <EntityHistoryDialog
        title={`Histórico do motorista ${historyDriver.name}`}
        loadPage={loadDriverHistory}
        onClose={() => setHistoryDriver(null)}
      />}
    </Box>
  )
}
