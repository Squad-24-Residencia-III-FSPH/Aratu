import { useEffect, useMemo, useState } from 'react'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import { Alert, Box, Button } from '@mui/material'
import { useAuth } from '../../../auth/useAuth'
import { resolveProfile } from '../../../auth/profiles'
import DataTable from '../../../components/ui/DataTable'
import type { DataTableColumn } from '../../../components/ui/DataTable'
import FilterBar from '../../../components/ui/FilterBar'
import { FormField } from '../../../components/ui/FormField'
import PageHeader from '../../../components/ui/PageHeader'
import StateFeedback from '../../../components/ui/StateFeedback'
import StatusChip from '../../../components/ui/StatusChip'
import ConfirmDialog from '../../../components/ui/ConfirmDialog'
import { canManageServiceTypes } from '../../../services/fleetServicesAccess'
import {
  createFleetService,
  FleetServiceRequestError,
  listFleetServices,
  setFleetServiceActive,
  updateFleetService,
} from '../../../services/fleetServicesService'
import type { FleetService } from '../../../services/fleetServicesService'
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
  const profile = session ? resolveProfile(session.perfil) : null
  const allowed = canManageServiceTypes(profile)
  const forbidden = !allowed

  const [rows, setRows] = useState<ServiceRow[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [refreshCount, setRefreshCount] = useState(0)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [formTarget, setFormTarget] = useState<ServiceRow | 'new' | null>(null)
  const [statusTarget, setStatusTarget] = useState<FleetService | null>(null)

  useEffect(() => {
    if (!allowed) return

    let current = true
    listFleetServices(api)
      .then((services) => {
        if (!current) return
        setRows(services.map((service) => ({ service })))
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
  }, [api, allowed, refreshCount])

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR')
    if (!normalizedQuery) return rows
    return rows.filter(({ service }) => `${service.name} ${service.description ?? ''}`
      .toLocaleLowerCase('pt-BR').includes(normalizedQuery))
  }, [query, rows])

  function reload() {
    setLoading(true)
    setLoadError(null)
    setRefreshCount((count) => count + 1)
  }

  function handleSaved(message: string) {
    setFormTarget(null)
    setStatusTarget(null)
    setFeedback(message)
    reload()
  }

  const columns = SERVICE_COLUMNS
  return (
    <Box>
      <PageHeader
        title="Tipos de serviço"
        breadcrumbs={['Início', 'Tipos de serviço']}
        description="Cadastre e mantenha os tipos de serviço disponíveis para associação aos veículos."
        actions={allowed ? (
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

          <FilterBar label="Pesquisar tipos de serviço" sx={{ mb: 2 }}>
            <Box sx={{ width: { xs: '100%', sm: 320 } }}>
              <FormField
                label="Pesquisar tipo de serviço"
                value={query}
                onChange={setQuery}
                placeholder="Nome ou descrição"
              />
            </Box>
          </FilterBar>

          {loadError ? (
            <StateFeedback kind="error" title="Não foi possível carregar os tipos de serviço" description={loadError}
              actionLabel="Tentar novamente" onAction={reload} />
          ) : loading ? (
            <StateFeedback kind="loading" title="Carregando tipos de serviço..." />
          ) : (
            <DataTable
              caption="Tipos de serviço cadastrados"
              columns={columns}
              rows={filteredRows}
              rowKey={(row) => row.service.id}
              minWidth={560}
              renderActions={(row) => (
                <Box sx={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                  <Button
                    size="small"
                    startIcon={<EditIcon aria-hidden="true" />}
                    onClick={() => { setFeedback(null); setFormTarget(row) }}
                    aria-label={`Editar tipo de serviço ${row.service.name}`}
                    sx={{ minHeight: 44 }}
                  >
                    Editar
                  </Button>
                  <Button
                    size="small"
                    onClick={() => { setFeedback(null); setStatusTarget(row.service) }}
                    aria-label={`${row.service.active ? 'Inativar' : 'Ativar'} tipo de serviço ${row.service.name}`}
                    sx={{ minHeight: 44 }}
                  >
                    {row.service.active ? 'Inativar' : 'Ativar'}
                  </Button>
                </Box>
              )}
              busy={loading}
              emptyContent={(
                <StateFeedback
                  kind="empty"
                  title={rows.length === 0 ? 'Nenhum tipo de serviço cadastrado' : 'Nenhum tipo encontrado'}
                  description={rows.length === 0
                    ? 'Use “Novo tipo” para cadastrar o primeiro serviço.'
                    : 'Ajuste a pesquisa para encontrar outros tipos de serviço.'}
                  centered
                />
              )}
            />
          )}
        </>
      )}

      {formTarget && (
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
          onSaved={(service) => handleSaved(`Tipo de serviço “${service.name}” ${service.active ? 'ativado' : 'inativado'}.`)}
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
      title={`${nextActive ? 'Ativar' : 'Inativar'} tipo de serviço`}
      description={nextActive
        ? `Deseja ativar “${service.name}”? O tipo ficará disponível para novas solicitações.`
        : `Deseja inativar “${service.name}”? O tipo deixará de aparecer em novas solicitações; registros existentes serão preservados.`}
      confirmLabel={nextActive ? 'Ativar tipo' : 'Inativar tipo'}
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
