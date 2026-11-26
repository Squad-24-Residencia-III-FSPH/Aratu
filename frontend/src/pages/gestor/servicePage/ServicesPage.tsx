import { useEffect, useState } from 'react'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import AutorenewIcon from '@mui/icons-material/Autorenew'
import { Alert, Box, Button, Stack, Typography } from '@mui/material'
import { useAuth } from '../../../auth/useAuth'
import { hasPermission } from '../../../auth/access'
import DataTable from '../../../components/ui/DataTable'
import type { DataTableColumn } from '../../../components/ui/DataTable'
import FilterBar from '../../../components/ui/FilterBar'
import { FormField, FormSelect } from '../../../components/ui/FormField'
import PageHeader from '../../../components/ui/PageHeader'
import StateFeedback from '../../../components/ui/StateFeedback'
import RowActionsMenu from '../../../components/ui/RowActionsMenu'
import type { RowActionItem } from '../../../components/ui/RowActionsMenu'
import StatusChip from '../../../components/ui/StatusChip'
import ConfirmDialog from '../../../components/ui/ConfirmDialog'
import {
  createFleetService,
  FleetServiceRequestError,
  listFleetServicePage,
  setFleetServiceActive,
  updateFleetService,
} from '../../../services/fleetServicesService'
import type { FleetService, FleetServicePage } from '../../../services/fleetServicesService'
import { VEHICLE_CATEGORY_LABELS } from '../../../vehicles/vehicleTypes'

interface ServiceRow {
  service: FleetService
}

interface ServiceFormValue {
  name: string
  description: string
  reason: string
}

const EMPTY_FORM: ServiceFormValue = { name: '', description: '', reason: '' }
const PAGE_SIZE = 20
const VIEW_OPTIONS = [
  { value: 'operational', label: 'Em operação' },
  { value: 'archived', label: 'Arquivados' },
  { value: 'all', label: 'Todos' },
]

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

const SERVICE_COLUMNS: readonly DataTableColumn<ServiceRow>[] = [
  {
    key: 'name',
    header: 'Tipo de serviço',
    render: (row) => (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <Box component="span" sx={{ fontWeight: 600 }}>{row.service.name}</Box>
        {row.service.description && (
          <Box component="span" sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
            {row.service.description}
          </Box>
        )}
      </Box>
    ),
  },
  {
    key: 'categories',
    header: 'Categoria compatível',
    render: (row) => row.service.categories.map((category) => VEHICLE_CATEGORY_LABELS[category]).join(', '),
  },
  {
    key: 'active',
    header: 'Situação',
    render: (row) => (
      <StatusChip
        label={row.service.active ? 'Ativo' : 'Inativo'}
        tone={row.service.active ? 'success' : 'neutral'}
      />
    ),
  },
]

/** Gerencia o catálogo independente de tipos de serviço. */
export default function ServicesPage() {
  const { api, session } = useAuth()
  const allowed = hasPermission(session, 'services:read')
  const canCreate = hasPermission(session, 'services:create')
  const canUpdate = hasPermission(session, 'services:update')
  const canArchive = hasPermission(session, 'services:archive')
  const canManage = canCreate || canUpdate || canArchive
  const forbidden = !allowed

  const [servicePage, setServicePage] = useState<FleetServicePage | null>(null)
  const [query, setQuery] = useState('')
  const [view, setView] = useState<'operational' | 'archived' | 'all'>('operational')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [refreshCount, setRefreshCount] = useState(0)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [formTarget, setFormTarget] = useState<ServiceRow | 'new' | null>(null)
  const [statusTarget, setStatusTarget] = useState<FleetService | null>(null)

  useEffect(() => {
    if (!allowed) return

    let current = true
    listFleetServicePage(api, {
      active: view === 'all' ? undefined : view === 'operational',
      search: query,
      page,
      pageSize: PAGE_SIZE,
    })
      .then((result) => {
        if (!current) return
        setServicePage(result)
        setLoading(false)
      })
      .catch((error: unknown) => {
        if (!current) return
        setLoading(false)
        if (error instanceof FleetServiceRequestError && error.kind === 'forbidden') {
          return
        }
        setLoadError(errorMessage(error, 'Não foi possível carregar os tipos de serviço.'))
      })
    return () => { current = false }
  }, [api, allowed, refreshCount, query, view, page])

  function reload() {
    setLoading(true)
    setLoadError(null)
    setPage(1)
    setRefreshCount((count) => count + 1)
  }

  function handleSaved(message: string) {
    setFormTarget(null)
    setStatusTarget(null)
    setFeedback(message)
    reload()
  }

  const columns = SERVICE_COLUMNS
  const emptyStateTitle = query.trim()
    ? 'Nenhum tipo encontrado'
    : view === 'operational'
      ? 'Nenhum tipo em operação'
      : view === 'archived'
        ? 'Nenhum tipo arquivado'
        : 'Nenhum tipo de serviço cadastrado'
  const emptyStateDescription = query.trim()
    ? 'Ajuste a pesquisa para encontrar outros tipos de serviço.'
    : view === 'operational'
      ? 'Consulte Arquivados ou Todos, ou cadastre um tipo de serviço.'
      : view === 'archived'
        ? 'Não há tipos arquivados neste momento.'
        : canCreate ? 'Use “Novo tipo” para cadastrar o primeiro serviço.' : 'Não há tipos de serviço cadastrados.'
  const activityOptions = canArchive ? VIEW_OPTIONS : VIEW_OPTIONS.filter((option) => option.value === 'operational')
  return (
    <Box>
      <PageHeader
        title="Serviços"
        description="Cadastre e mantenha os tipos de serviço disponíveis para associação aos veículos."
        actions={canCreate ? (
          <Button
            variant="contained"
            startIcon={<AddIcon aria-hidden="true" />}
            onClick={() => { setFeedback(null); setFormTarget('new') }}
            sx={{ minHeight: 44 }}
          >
            Novo tipo
          </Button>
        ) : undefined}
      />

      {forbidden && <StateFeedback kind="forbidden" title="Acesso restrito" description="Seu perfil não pode gerenciar tipos de serviço." />}

      {allowed && (
        <>
          {feedback && (
            <Alert
              severity="success"
              onClose={() => setFeedback(null)}
              sx={{ mb: 2 }}
            >
              <strong>Alteração salva: </strong>{feedback}
            </Alert>
          )}
          {!canManage && <Alert severity="info" sx={{ mb: 2 }}>Seu perfil permite apenas consultar tipos de serviço.</Alert>}

          <FilterBar label="Pesquisar tipos de serviço" sx={{ mb: 2 }}>
            <Box sx={{ flex: '1 1 280px', minWidth: { xs: '100%', sm: 260 } }}>
              <FormField
                label="Pesquisar tipo de serviço"
                value={query}
                onChange={(value) => { setQuery(value); setPage(1); setLoading(true); setLoadError(null) }}
                placeholder="Nome ou descrição"
              />
            </Box>
            <Box sx={{ width: { xs: '100%', sm: 190 } }}>
            <FormSelect label="Atividade" value={view} onChange={(value) => { setView(value as typeof view); setPage(1); setLoading(true); setLoadError(null) }} options={activityOptions} />
            </Box>
          </FilterBar>

          {loadError ? (
            <StateFeedback kind="error" title="Não foi possível carregar os tipos de serviço" description={loadError}
              actionLabel="Tentar novamente" onAction={reload} />
          ) : loading ? (
            <StateFeedback kind="loading" title="Carregando tipos de serviço..." />
          ) : servicePage && (
            <>
            <DataTable
              caption="Tipos de serviço cadastrados"
              columns={columns}
              rows={servicePage.items.map((service) => ({ service }))}
              rowKey={(row) => row.service.id}
              minWidth={560}
              actionsWidth={64}
              renderActions={canUpdate || canArchive ? (row) => {
                const actions: RowActionItem[] = [
                  ...(canUpdate ? [{ key: 'edit', label: 'Editar cadastro', icon: <EditIcon fontSize="small" />, onSelect: () => { setFeedback(null); setFormTarget(row) } }] : []),
                  ...(canArchive ? [{ key: 'activity', label: row.service.active ? 'Arquivar' : 'Restaurar', icon: <AutorenewIcon fontSize="small" />, danger: row.service.active, onSelect: () => { setFeedback(null); setStatusTarget(row.service) } }] : []),
                ]
                return actions.length > 0 ? <RowActionsMenu label={`Ações do tipo de serviço ${row.service.name}`} actions={actions} /> : null
              } : undefined}
              busy={loading}
              emptyContent={(
                <StateFeedback
                  kind="empty"
                  title={emptyStateTitle}
                  description={emptyStateDescription}
                  centered
                />
              )}
            />
            <Stack component="nav" aria-label="Paginação de tipos de serviço" direction="row" sx={{ mt: 2, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
              <Typography variant="body2" color="text.secondary">{servicePage.total} tipo(s) de serviço</Typography>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Button color="inherit" disabled={servicePage.page <= 1 || loading} onClick={() => { setPage((current) => Math.max(1, current - 1)); setLoading(true) }} sx={{ minHeight: 44 }}>Anterior</Button>
                <Typography role="status">Página {servicePage.page} de {Math.max(1, servicePage.totalPages)}</Typography>
                <Button color="inherit" disabled={servicePage.page >= servicePage.totalPages || loading} onClick={() => { setPage((current) => current + 1); setLoading(true) }} sx={{ minHeight: 44 }}>Próxima</Button>
              </Stack>
            </Stack>
            </>
          )}
        </>
      )}

      {formTarget && (canCreate || canUpdate) && (
        <ServiceFormDialog
          key={formTarget === 'new' ? 'new' : formTarget.service.id}
          api={api}
          row={formTarget === 'new' ? null : formTarget}
          onSaved={handleSaved}
          onCancel={() => setFormTarget(null)}
        />
      )}
      {statusTarget && (
        <ServiceStatusDialog
          key={statusTarget.id}
          api={api}
          service={statusTarget}
          onSaved={(service) => handleSaved(`Tipo de serviço “${service.name}” ${service.active ? 'restaurado' : 'arquivado'}.`)}
          onCancel={() => setStatusTarget(null)}
        />
      )}
    </Box>
  )
}

interface ServiceFormDialogProps {
  api: ReturnType<typeof useAuth>['api']
  row: ServiceRow | null
  onSaved: (message: string) => void
  onCancel: () => void
}

function ServiceFormDialog({ api, row, onSaved, onCancel }: ServiceFormDialogProps) {
  const [value, setValue] = useState<ServiceFormValue>(() => row
    ? {
        name: row.service.name,
        description: row.service.description ?? '',
        reason: '',
      }
    : EMPTY_FORM)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const attributesChanged = !row || value.name.trim() !== row.service.name
    || value.description.trim() !== (row.service.description ?? '')

  async function handleSave() {
    if (!value.name.trim()) {
      setFieldError('Informe o nome do tipo de serviço.')
      return
    }
    if (!value.reason.trim()) {
      setFieldError('Informe a justificativa da alteração.')
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    setFieldError(null)
    try {
      const persistedService = row
        ? attributesChanged
          ? await updateFleetService(api, row.service, {
              name: value.name.trim(), description: value.description.trim(), reason: value.reason.trim(),
            })
          : row.service
        : await createFleetService(api, {
            name: value.name.trim(), description: value.description.trim(), reason: value.reason.trim(),
          })

      onSaved(row ? `Tipo de serviço “${persistedService.name}” atualizado.`
        : `Tipo de serviço “${persistedService.name}” cadastrado.`)
    } catch (error) {
      setSubmitError(errorMessage(error, 'Não foi possível salvar o tipo de serviço.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ConfirmDialog
      open
      title={row ? 'Editar tipo de serviço' : 'Novo tipo de serviço'}
      description="Informe os dados do tipo de serviço. A associação aos veículos é feita no cadastro de cada veículo."
      confirmLabel={row ? 'Salvar alterações' : 'Cadastrar tipo'}
      onConfirm={handleSave}
      onCancel={onCancel}
      cancelLabel="Voltar"
      loading={submitting}
      confirmDisabled={submitting || !attributesChanged}
      paperSx={{ maxWidth: 560 }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
        {submitError && <Alert severity="error" role="alert">{submitError}</Alert>}
        <FormField
          label="Nome"
          value={value.name}
          onChange={(name) => setValue((current) => ({ ...current, name }))}
          error={fieldError?.includes('nome') ? fieldError : undefined}
          required
          autoFocus={!row}
        />
        <FormField
          label="Descrição"
          value={value.description}
          onChange={(description) => setValue((current) => ({ ...current, description }))}
          multiline
          minRows={2}
        />
        <FormField
          label="Justificativa"
          value={value.reason}
          onChange={(reason) => setValue((current) => ({ ...current, reason }))}
          error={fieldError?.includes('justificativa') ? fieldError : undefined}
          helperText="Registrada na auditoria da alteração."
          required
          multiline
          minRows={2}
        />
      </Box>
    </ConfirmDialog>
  )
}

interface ServiceStatusDialogProps {
  api: ReturnType<typeof useAuth>['api']
  service: FleetService
  onSaved: (service: FleetService) => void
  onCancel: () => void
}

function ServiceStatusDialog({ api, service, onSaved, onCancel }: ServiceStatusDialogProps) {
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState<string | undefined>()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const nextActive = !service.active

  async function handleConfirm() {
    if (!reason.trim()) {
      setReasonError('Informe a justificativa da mudança de situação.')
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    try {
      const updated = await setFleetServiceActive(api, service, nextActive, reason.trim())
      onSaved(updated)
    } catch (error) {
      setSubmitError(errorMessage(error, 'Não foi possível alterar a situação do tipo de serviço.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ConfirmDialog
      open
      title={`${nextActive ? 'Restaurar' : 'Arquivar'} tipo de serviço`}
      description={nextActive
        ? `Deseja restaurar “${service.name}”? O tipo ficará disponível para novas operações.`
        : `Deseja arquivar “${service.name}”? O tipo deixará de aparecer nas consultas operacionais; vínculos e registros existentes serão preservados.`}
      confirmLabel={nextActive ? 'Restaurar tipo' : 'Arquivar tipo'}
      danger={!nextActive}
      onConfirm={handleConfirm}
      onCancel={onCancel}
      cancelLabel="Manter situação atual"
      loading={submitting}
      confirmDisabled={submitting}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
        {submitError && <Alert severity="error" role="alert">{submitError}</Alert>}
        <FormField
          label="Justificativa"
          value={reason}
          onChange={(nextReason) => {
            setReason(nextReason)
            setReasonError(undefined)
          }}
          error={reasonError}
          helperText="Registrada na auditoria do tipo de serviço."
          required
          multiline
          minRows={2}
          autoFocus
        />
      </Box>
    </ConfirmDialog>
  )
}
