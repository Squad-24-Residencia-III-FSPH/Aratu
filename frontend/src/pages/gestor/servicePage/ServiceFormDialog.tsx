import { useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Alert, Box, Button } from '@mui/material'
import type { ApiRequest } from '../../../api/client'
import ConfirmDialog from '../../../components/ui/ConfirmDialog'
import { FormField } from '../../../components/ui/FormField'
import { accessibleControls } from '../../../components/ui/accessibleControls'
import {
  createFleetService,
  FleetServiceRequestError,
  isDuplicateServiceNameError,
  isUncertainServiceError,
  listCompatibleVehicles,
  listFleetServices,
  replaceCompatibleVehicles,
  updateFleetService,
} from '../../../services/fleetServicesService'
import type { CompatibleVehicleSummary, FleetService } from '../../../services/fleetServicesService'
import type { Vehicle } from '../../../vehicles/vehicleTypes'
import CompatibleVehiclesField from './CompatibleVehiclesField'
import {
  buildCompatibleVehicleOptions,
  readServiceErrorMessage,
  reconcileAttributesOutcome,
  reconcileCreateOutcome,
  reconcileVehiclesOutcome,
  sameIds,
  validateServiceFormInput,
} from './serviceHelpers'
import type { ServiceFormErrors, ServiceFormFieldKey, ServiceLinksState, ServiceRow } from './serviceHelpers'

type PendingUncertainStep = 'create' | 'update-attributes' | 'update-vehicles'

interface SubmitAlertState {
  severity: 'error' | 'warning' | 'info'
  message: string
  canConsultState?: boolean
}

export interface ServiceFormDialogProps {
  api: ApiRequest
  vehicles: readonly Vehicle[]
  vehiclesLoadError: string | null
  onRetryVehicles: () => void
  knownServiceIds: ReadonlySet<string>
  row: ServiceRow | null
  onRetryRowLinks: (serviceId: string) => Promise<CompatibleVehicleSummary[] | null>
  onServicePersisted: (service: FleetService, linkedVehicles?: readonly CompatibleVehicleSummary[]) => void
  onSaved: (message: string) => void
  onCancel: () => void
}

/**
 * Diálogo de cadastro e edição de tipos de serviço com reconciliação entre
 * POST/PUT de atributos e PUT de vínculos, foco acessível e preservação de rascunho.
 */
export default function ServiceFormDialog({
  api,
  vehicles,
  vehiclesLoadError,
  onRetryVehicles,
  knownServiceIds,
  row,
  onRetryRowLinks,
  onServicePersisted,
  onSaved,
  onCancel,
}: ServiceFormDialogProps) {
  const [persistedService, setPersistedService] = useState<FleetService | null>(() => row?.service ?? null)
  const [localLinks, setLocalLinks] = useState<ServiceLinksState | null>(null)
  const [name, setName] = useState(() => row?.service.name ?? '')
  const [description, setDescription] = useState(() => row?.service.description ?? '')
  const [reason, setReason] = useState('')
  const [draftVehicleIds, setDraftVehicleIds] = useState<string[] | null>(null)
  const [retryingLinks, setRetryingLinks] = useState(false)

  const [fieldErrors, setFieldErrors] = useState<ServiceFormErrors>({})
  const [submitAlert, setSubmitAlert] = useState<SubmitAlertState | null>(null)
  const [pendingStep, setPendingStep] = useState<PendingUncertainStep | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [reconciling, setReconciling] = useState(false)

  const submittingRef = useRef(false)
  const nameInputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const vehiclesContainerRef = useRef<HTMLDivElement>(null)
  const reasonInputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)

  const effectiveLinks: ServiceLinksState = useMemo(() => {
    if (localLinks) return localLinks
    if (row) return row.links
    return { status: 'loaded', vehicles: [] }
  }, [localLinks, row])

  const persistedVehicles: readonly CompatibleVehicleSummary[] = useMemo(
    () => (effectiveLinks.status === 'loaded' ? effectiveLinks.vehicles : []),
    [effectiveLinks],
  )

  const linksReady = persistedService === null ? true : effectiveLinks.status === 'loaded'
  const linksError = effectiveLinks.status === 'error' ? effectiveLinks.message : null

  const persistedVehicleIds = useMemo(
    () => persistedVehicles.map((vehicle) => vehicle.id),
    [persistedVehicles],
  )

  const selectedVehicleIds = useMemo(
    () => draftVehicleIds ?? persistedVehicleIds,
    [draftVehicleIds, persistedVehicleIds],
  )

  const vehicleOptions = useMemo(
    () => buildCompatibleVehicleOptions(vehicles, persistedVehicles, persistedVehicleIds),
    [vehicles, persistedVehicles, persistedVehicleIds],
  )

  const attributesChanged = persistedService === null
    || name.trim() !== persistedService.name
    || description.trim() !== (persistedService.description ?? '')

  const vehicleIdsChanged = linksReady && (
    persistedService === null
      ? selectedVehicleIds.length > 0
      : !sameIds(selectedVehicleIds, persistedVehicleIds)
  )

  function focusField(field: ServiceFormFieldKey | null) {
    if (field === 'name') {
      nameInputRef.current?.focus()
      return
    }
    if (field === 'vehicleIds') {
      vehiclesContainerRef.current?.querySelector<HTMLElement>('[role="combobox"]')?.focus()
      return
    }
    if (field === 'reason') {
      reasonInputRef.current?.focus()
    }
  }

  function clearFieldError(field: ServiceFormFieldKey) {
    setFieldErrors((current) => {
      if (!current[field]) return current
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  async function handleRetryLinksClick() {
    if (!persistedService || retryingLinks) return
    setRetryingLinks(true)
    const loaded = await onRetryRowLinks(persistedService.id)
    setRetryingLinks(false)
    if (loaded) {
      setLocalLinks({ status: 'loaded', vehicles: loaded })
      setDraftVehicleIds(null)
    }
  }

  /**
   * Consulta o estado vigente na API para evitar duplicação ou sobrescrita
   * após resultado incerto (erro de rede/5xx) ou conflito de revisão.
   */
  async function consultAndReconcile(
    step: PendingUncertainStep,
    targetService: FleetService | null = persistedService,
  ): Promise<'proceed' | 'completed' | 'stop'> {
    setReconciling(true)
    try {
      if (step === 'create') {
        const servicesFromServer = await listFleetServices(api)
        const result = reconcileCreateOutcome(servicesFromServer, knownServiceIds, name)
        setPendingStep(null)
        if (result.kind === 'created-confirmed') {
          setPersistedService(result.service)
          setLocalLinks({ status: 'loaded', vehicles: [] })
          onServicePersisted(result.service, [])
          if (selectedVehicleIds.length === 0) {
            onSaved(`Tipo de serviço “${result.service.name}” cadastrado.`)
            return 'completed'
          }
          setSubmitAlert({
            severity: 'warning',
            message: `Consultamos o catálogo e confirmamos que o tipo “${result.service.name}” (ID ${result.service.id}) já foi cadastrado. Clique para salvar apenas os veículos compatíveis, sem duplicar o cadastro.`,
          })
          return 'stop'
        }
        setSubmitAlert({
          severity: 'info',
          message: 'Consultamos o catálogo e confirmamos que o tipo ainda não foi cadastrado. Você pode tentar cadastrar novamente.',
        })
        return 'proceed'
      }

      if (!targetService) {
        setPendingStep(null)
        return 'proceed'
      }

      if (step === 'update-attributes') {
        const servicesFromServer = await listFleetServices(api)
        const result = reconcileAttributesOutcome(
          servicesFromServer,
          targetService.id,
          targetService.revision,
          name,
          description,
        )
        setPendingStep(null)
        if (result.kind === 'not-found') {
          setSubmitAlert({
            severity: 'error',
            message: 'Este tipo de serviço não foi encontrado no servidor. Volte à listagem para atualizar.',
          })
          return 'stop'
        }
        if (result.kind === 'attributes-confirmed') {
          setPersistedService(result.service)
          onServicePersisted(result.service)
          if (!vehicleIdsChanged) {
            onSaved(`Tipo de serviço “${result.service.name}” atualizado.`)
            return 'completed'
          }
          setSubmitAlert({
            severity: 'warning',
            message: `Os dados do tipo “${result.service.name}” (ID ${result.service.id}) já haviam sido salvos. Revise e tente salvar os veículos compatíveis.`,
          })
          return 'stop'
        }
        if (result.kind === 'concurrent-change') {
          setPersistedService(result.service)
          onServicePersisted(result.service)
          setSubmitAlert({
            severity: 'warning',
            message: `O tipo de serviço foi atualizado por outra operação (revisão ${result.service.revision}). Confira seu rascunho antes de salvar novamente.`,
          })
          return 'stop'
        }
        setSubmitAlert({
          severity: 'info',
          message: 'Confirmamos que a alteração de dados ainda não foi gravada. Você pode tentar novamente.',
        })
        return 'proceed'
      }

      const [servicesFromServer, linkedView] = await Promise.all([
        listFleetServices(api),
        listCompatibleVehicles(api, targetService.id),
      ])
      const latestService = servicesFromServer.find((service) => service.id === targetService.id) ?? targetService
      const result = reconcileVehiclesOutcome(linkedView, targetService.revision, selectedVehicleIds)
      setPendingStep(null)
      setPersistedService(latestService)
      setLocalLinks({ status: 'loaded', vehicles: linkedView.vehicles })
      onServicePersisted(latestService, linkedView.vehicles)

      if (result.kind === 'vehicles-confirmed') {
        onSaved(row
          ? `Tipo de serviço “${latestService.name}” atualizado.`
          : `Tipo de serviço “${latestService.name}” cadastrado com os veículos compatíveis.`)
        return 'completed'
      }
      if (result.kind === 'concurrent-change') {
        setSubmitAlert({
          severity: 'warning',
          message: `Os vínculos ou a revisão do serviço foram alterados por outra operação (revisão ${linkedView.revision}). Sua seleção pendente foi preservada para conferência.`,
        })
        return 'stop'
      }
      setSubmitAlert({
        severity: 'warning',
        message: `Confirmamos que os veículos compatíveis do tipo “${latestService.name}” (ID ${latestService.id}) ainda não foram atualizados. Sua seleção e justificativa foram mantidas para nova tentativa.`,
      })
      return 'stop'
    } catch (error) {
      setPendingStep(step)
      setSubmitAlert({
        severity: 'error',
        message: `Não foi possível consultar o estado atual no servidor: ${readServiceErrorMessage(error, 'falha de comunicação')}. Consulte novamente antes de tentar gravar.`,
        canConsultState: true,
      })
      return 'stop'
    } finally {
      setReconciling(false)
    }
  }

  async function handleSave() {
    if (submittingRef.current) return

    if (pendingStep !== null) {
      submittingRef.current = true
      setSubmitting(true)
      const status = await consultAndReconcile(pendingStep, persistedService)
      submittingRef.current = false
      setSubmitting(false)
      if (status !== 'proceed') return
    }

    const { errors, firstInvalid } = validateServiceFormInput({
      name,
      reason,
      vehicleIds: selectedVehicleIds,
      vehicleIdsChanged,
      vehicleOptions,
    })
    setFieldErrors(errors)
    if (firstInvalid) {
      focusField(firstInvalid)
      return
    }

    submittingRef.current = true
    setSubmitting(true)
    setSubmitAlert(null)

    const trimmedName = name.trim()
    const trimmedDescription = description.trim()
    const trimmedReason = reason.trim()
    const createdInEarlierAttempt = row === null && persistedService !== null

    let currentService: FleetService | null = persistedService
    let savedServiceThisSubmit = false

    try {
      if (currentService === null) {
        try {
          const created = await createFleetService(api, {
            name: trimmedName,
            description: trimmedDescription,
            reason: trimmedReason,
          })
          currentService = created
          savedServiceThisSubmit = true
          setPersistedService(created)
          setLocalLinks({ status: 'loaded', vehicles: [] })
          onServicePersisted(created, [])
        } catch (error) {
          if (isDuplicateServiceNameError(error)) {
            setFieldErrors((current) => ({ ...current, name: error instanceof Error ? error.message : 'Tipo de serviço já cadastrado' }))
            focusField('name')
            return
          }
          if (error instanceof FleetServiceRequestError && error.kind === 'validation' && error.message.toLocaleLowerCase('pt-BR').includes('nome')) {
            setFieldErrors((current) => ({ ...current, name: error.message }))
            focusField('name')
            return
          }
          if (isUncertainServiceError(error)) {
            await consultAndReconcile('create', null)
            return
          }
          setSubmitAlert({
            severity: 'error',
            message: readServiceErrorMessage(error, 'Não foi possível cadastrar o tipo de serviço.'),
          })
          return
        }
      } else if (attributesChanged) {
        try {
          const updated = await updateFleetService(api, currentService, {
            name: trimmedName,
            description: trimmedDescription,
            reason: trimmedReason,
          })
          currentService = updated
          savedServiceThisSubmit = true
          setPersistedService(updated)
          onServicePersisted(updated)
        } catch (error) {
          if (isDuplicateServiceNameError(error)) {
            setFieldErrors((current) => ({ ...current, name: error instanceof Error ? error.message : 'Tipo de serviço já cadastrado' }))
            focusField('name')
            return
          }
          if (error instanceof FleetServiceRequestError && error.kind === 'conflict') {
            setPendingStep('update-attributes')
            setSubmitAlert({
              severity: 'warning',
              message: error.message,
              canConsultState: true,
            })
            return
          }
          if (error instanceof FleetServiceRequestError && error.kind === 'validation' && error.message.toLocaleLowerCase('pt-BR').includes('nome')) {
            setFieldErrors((current) => ({ ...current, name: error.message }))
            focusField('name')
            return
          }
          if (isUncertainServiceError(error)) {
            await consultAndReconcile('update-attributes', currentService)
            return
          }
          setSubmitAlert({
            severity: 'error',
            message: readServiceErrorMessage(error, 'Não foi possível atualizar o tipo de serviço.'),
          })
          return
        }
      }

      if (vehicleIdsChanged && currentService) {
        try {
          const updatedView = await replaceCompatibleVehicles(api, currentService.id, {
            vehicleIds: selectedVehicleIds,
            expectedRevision: currentService.revision,
            reason: trimmedReason,
          })
          const refreshedService: FleetService = { ...currentService, revision: updatedView.revision }
          setPersistedService(refreshedService)
          setLocalLinks({ status: 'loaded', vehicles: updatedView.vehicles })
          onServicePersisted(refreshedService, updatedView.vehicles)
          onSaved(row
            ? `Tipo de serviço “${refreshedService.name}” atualizado.`
            : `Tipo de serviço “${refreshedService.name}” cadastrado com os veículos compatíveis.`)
          return
        } catch (error) {
          const serviceWasPersisted = savedServiceThisSubmit || createdInEarlierAttempt
          const failureReason = readServiceErrorMessage(error, 'falha de comunicação')

          if (isUncertainServiceError(error)) {
            const reconciliation = await consultAndReconcile('update-vehicles', currentService)
            if (reconciliation === 'completed') return
            if (serviceWasPersisted && reconciliation === 'stop') {
              setSubmitAlert((current) => {
                if (current?.canConsultState) return current
                return {
                  severity: 'warning',
                  message: `O cadastro do tipo “${currentService?.name}” (ID ${currentService?.id}) foi salvo, mas os veículos compatíveis não foram atualizados: ${failureReason}. Sua seleção e justificativa foram mantidas para nova tentativa.`,
                }
              })
            }
            return
          }

          if (error instanceof FleetServiceRequestError && error.kind === 'conflict') {
            setPendingStep('update-vehicles')
          }

          if (serviceWasPersisted) {
            setSubmitAlert({
              severity: 'warning',
              message: `O tipo de serviço “${currentService.name}” (ID ${currentService.id}) foi salvo, mas a lista de veículos compatíveis foi recusada: ${failureReason}. Ajuste a seleção ou tente novamente sem perder seus dados.`,
              canConsultState: error instanceof FleetServiceRequestError && error.kind === 'conflict',
            })
          } else {
            setSubmitAlert({
              severity: 'error',
              message: `A lista de veículos compatíveis não foi atualizada: ${failureReason}`,
              canConsultState: error instanceof FleetServiceRequestError && error.kind === 'conflict',
            })
          }
          return
        }
      }

      if (currentService) {
        onSaved(row
          ? `Tipo de serviço “${currentService.name}” atualizado.`
          : `Tipo de serviço “${currentService.name}” cadastrado.`)
      }
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void handleSave()
  }

  const confirmLabel = pendingStep !== null
    ? 'Consultar e continuar'
    : persistedService === null
      ? 'Cadastrar tipo'
      : row === null && !attributesChanged
        ? 'Salvar veículos compatíveis'
        : 'Salvar alterações'

  const nothingChanged = persistedService !== null
    && !attributesChanged
    && !vehicleIdsChanged
    && pendingStep === null

  return (
    <ConfirmDialog
      open
      title={row || persistedService ? 'Editar tipo de serviço' : 'Novo tipo de serviço'}
      description={persistedService && row === null
        ? `Tipo de serviço #${persistedService.id} salvo. Conclua a associação dos veículos compatíveis.`
        : 'Informe os dados do serviço e os veículos da frota que podem atendê-lo.'}
      confirmLabel={confirmLabel}
      onConfirm={() => void handleSave()}
      onCancel={onCancel}
      cancelLabel="Voltar"
      loading={submitting || reconciling}
      confirmDisabled={submitting || reconciling || nothingChanged}
      paperSx={{ maxWidth: 560 }}
      sx={accessibleControls}
    >
      <Box component="form" onSubmit={handleFormSubmit} noValidate sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
        {submitAlert && (
          <Alert
            severity={submitAlert.severity}
            role="alert"
            action={submitAlert.canConsultState && pendingStep ? (
              <Button
                color="inherit"
                size="small"
                disabled={reconciling || submitting}
                onClick={() => void consultAndReconcile(pendingStep, persistedService)}
              >
                Consultar estado atual
              </Button>
            ) : undefined}
          >
            {submitAlert.message}
          </Alert>
        )}

        <FormField
          label="Nome"
          value={name}
          onChange={(nextName) => {
            setName(nextName)
            clearFieldError('name')
          }}
          error={fieldErrors.name}
          required
          autoFocus
          inputRef={nameInputRef}
        />

        <FormField
          label="Descrição"
          value={description}
          onChange={setDescription}
          multiline
          minRows={2}
        />

        {vehiclesLoadError && (
          <Alert
            severity="warning"
            role="alert"
            action={(
              <Button color="inherit" size="small" onClick={onRetryVehicles}>
                Tentar novamente
              </Button>
            )}
          >
            {vehiclesLoadError}
          </Alert>
        )}

        {linksError ? (
          <Alert
            severity="warning"
            role="alert"
            action={(
              <Button
                color="inherit"
                size="small"
                disabled={retryingLinks}
                onClick={() => void handleRetryLinksClick()}
              >
                {retryingLinks ? 'Consultando...' : 'Consultar vínculos'}
              </Button>
            )}
          >
            Não foi possível carregar os veículos compatíveis atuais deste serviço ({linksError}). Os atributos continuam editáveis; consulte os vínculos antes de alterá-los.
          </Alert>
        ) : (
          <CompatibleVehiclesField
            value={selectedVehicleIds}
            onChange={(nextVehicleIds) => {
              setDraftVehicleIds(nextVehicleIds)
              clearFieldError('vehicleIds')
            }}
            options={vehicleOptions}
            error={fieldErrors.vehicleIds}
            disabled={!linksReady}
            helperText="Selecione os veículos ativos que podem atender ao serviço. Veículos inativos ficam indisponíveis para nova seleção."
            containerRef={vehiclesContainerRef}
          />
        )}

        <FormField
          label="Justificativa"
          value={reason}
          onChange={(nextReason) => {
            setReason(nextReason)
            clearFieldError('reason')
          }}
          error={fieldErrors.reason}
          helperText="Registrada na auditoria da alteração."
          required
          multiline
          minRows={2}
          inputRef={reasonInputRef}
        />
      </Box>
    </ConfirmDialog>
  )
}
