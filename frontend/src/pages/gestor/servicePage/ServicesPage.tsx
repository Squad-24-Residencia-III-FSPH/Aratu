import { useEffect, useMemo, useState } from 'react'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import { Alert, Box, Button } from '@mui/material'
import { useAuth } from '../../../auth/useAuth'
import { resolveProfile } from '../../../auth/profiles'
import DataTable from '../../../components/ui/DataTable'
import type { DataTableColumn } from '../../../components/ui/DataTable'
import FilterBar from '../../../components/ui/FilterBar'
import { FormField, FormSelect } from '../../../components/ui/FormField'
import PageHeader from '../../../components/ui/PageHeader'
import StateFeedback from '../../../components/ui/StateFeedback'
import StatusChip from '../../../components/ui/StatusChip'
import ConfirmDialog from '../../../components/ui/ConfirmDialog'
import { listVehicles } from '../../../services/vehiclesService'
import { canManageServiceTypes } from '../../../services/fleetServicesAccess'
import {
  createFleetService,
  FleetServiceRequestError,
  listCompatibleVehicles,
  listFleetServices,
  replaceCompatibleVehicles,
  setFleetServiceActive,
  updateFleetService,
} from '../../../services/fleetServicesService'
import type { FleetService } from '../../../services/fleetServicesService'
import type { Vehicle } from '../../../vehicles/vehicleTypes'
import { VEHICLE_CATEGORY_LABELS } from '../../../vehicles/vehicleTypes'

interface ServiceRow {
  service: FleetService
  vehicles: { id: string; licensePlate: string }[]
}

interface ServiceFormValue {
  name: string
  description: string
  reason: string
  vehicleIds: string[]
}

const EMPTY_FORM: ServiceFormValue = { name: '', description: '', reason: '', vehicleIds: [] }

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id) => right.includes(id))
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
    key: 'vehicles',
    header: 'Veículos compatíveis',
    render: (row) => row.vehicles.length === 1 ? '1 veículo' : `${row.vehicles.length} veículos`,
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

/** Gerencia tipos de serviço, veículos compatíveis e situação do catálogo. */
export default function ServicesPage() {
  const { api, session } = useAuth()
  const profile = session ? resolveProfile(session.perfil) : null
  const allowed = canManageServiceTypes(profile)
  const [rows, setRows] = useState<ServiceRow[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [forbidden, setForbidden] = useState(false)
  const [refreshCount, setRefreshCount] = useState(0)
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'partial'; message: string } | null>(null)
  const [formTarget, setFormTarget] = useState<ServiceRow | 'new' | null>(null)
  const [statusTarget, setStatusTarget] = useState<FleetService | null>(null)

  useEffect(() => {
    if (!allowed) {
      setLoading(false)
      setForbidden(true)
      return
    }
    let current = true
    setLoading(true)
    setLoadError(null)
    Promise.all([listFleetServices(api), listVehicles(api)])
      .then(async ([services, loadedVehicles]) => {
        const linked = await Promise.all(services.map((service) => listCompatibleVehicles(api, service.id)))
        if (!current) return
        setVehicles(loadedVehicles)
        setRows(services.map((service, index) => ({ service, vehicles: linked[index]?.vehicles ?? [] })))
        setLoading(false)
      })
      .catch((error: unknown) => {
        if (!current) return
        setLoading(false)
        if (error instanceof FleetServiceRequestError && error.kind === 'forbidden') {
          setForbidden(true)
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
    setLoadError(null)
    setForbidden(false)
    setRefreshCount((count) => count + 1)
  }

  function handleSaved(message: string) {
    setFormTarget(null)
    setStatusTarget(null)
    setFeedback({ kind: 'success', message })
    reload()
  }

  function handlePartial(message: string) {
    setFormTarget(null)
    setFeedback({ kind: 'partial', message })
    reload()
  }

  const columns = SERVICE_COLUMNS
  return (
    <Box>
      <PageHeader
        title="Tipos de serviço"
        breadcrumbs={['Início', 'Tipos de serviço']}
        description="Cadastre os serviços da frota e defina quais veículos podem atendê-los."
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
              severity={feedback.kind === 'partial' ? 'warning' : 'success'}
              onClose={() => setFeedback(null)}
              action={
                feedback.kind === 'partial' ? (
                  <Button color="inherit" size="small" onClick={reload}>
                    Atualizar lista
                  </Button>
                ) : undefined
              }
              sx={{ mb: 2 }}
            >
              <strong>
                {feedback.kind === 'partial' ? 'Alteração parcialmente concluída: ' : 'Alteração salva: '}
              </strong>
              {feedback.message}
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
              minWidth={760}
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
          vehicles={vehicles}
          row={formTarget === 'new' ? null : formTarget}
          onSaved={handleSaved}
          onPartial={handlePartial}
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
  vehicles: Vehicle[]
  row: ServiceRow | null
  onSaved: (message: string) => void
  onPartial: (message: string) => void
  onCancel: () => void
}

function ServiceFormDialog({ api, vehicles, row, onSaved, onPartial, onCancel }: ServiceFormDialogProps) {
  const [value, setValue] = useState<ServiceFormValue>(() => row
    ? {
        name: row.service.name,
        description: row.service.description ?? '',
        reason: '',
        vehicleIds: row.vehicles.map((vehicle) => vehicle.id),
      }
    : EMPTY_FORM)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const vehicleOptions = vehicles.map((vehicle) => ({
    value: vehicle.id,
    label: `${vehicle.licensePlate} — ${[vehicle.brand, vehicle.model].filter(Boolean).join(' ') || 'Veículo'}${vehicle.status === 'INACTIVE' ? ' (inativo)' : ''}`,
  }))
  const vehicleIdsChanged = row ? !sameIds(value.vehicleIds, row.vehicles.map((vehicle) => vehicle.id)) : true
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
    let persistedService: FleetService | null = null
    try {
      persistedService = row
        ? attributesChanged
          ? await updateFleetService(api, row.service, {
              name: value.name.trim(), description: value.description.trim(), reason: value.reason.trim(),
            })
          : row.service
        : await createFleetService(api, {
            name: value.name.trim(), description: value.description.trim(), reason: value.reason.trim(),
          })

      if (!row || vehicleIdsChanged) {
        await replaceCompatibleVehicles(api, persistedService.id, {
          vehicleIds: value.vehicleIds,
          expectedRevision: persistedService.revision,
          reason: value.reason.trim(),
        })
      }
      onSaved(row ? `Tipo de serviço “${persistedService.name}” atualizado.`
        : `Tipo de serviço “${persistedService.name}” cadastrado com os veículos compatíveis.`)
    } catch (error) {
      if (persistedService) {
        onPartial(`Os dados do tipo “${persistedService.name}” foram salvos, mas a lista de veículos compatíveis não foi atualizada: ${errorMessage(error, 'falha de comunicação')}`)
      } else {
        setSubmitError(errorMessage(error, 'Não foi possível salvar o tipo de serviço.'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ConfirmDialog
      open
      title={row ? 'Editar tipo de serviço' : 'Novo tipo de serviço'}
      description="Informe os dados do serviço e os veículos da frota que podem atendê-lo."
      confirmLabel={row ? 'Salvar alterações' : 'Cadastrar tipo'}
      onConfirm={handleSave}
      onCancel={onCancel}
      cancelLabel="Voltar"
      loading={submitting}
      confirmDisabled={submitting || (!attributesChanged && !vehicleIdsChanged)}
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
        <FormSelect
          label="Veículos compatíveis"
          value={value.vehicleIds}
          onChange={(vehicleIds) => setValue((current) => ({ ...current, vehicleIds }))}
          options={vehicleOptions}
          multiple
          helperText="Selecione os veículos que podem atender ao serviço. Veículos inativos não podem ser vinculados."
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