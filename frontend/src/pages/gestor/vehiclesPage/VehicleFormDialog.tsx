import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
} from '@mui/material'
import type { ApiRequest } from '../../../api/client'
import { accessibleControls } from '../../../components/ui/accessibleControls'
import { FormField, FormSelect } from '../../../components/ui/FormField'
import {
  listFleetServiceAssignments,
  saveFleetServiceAssignments,
} from '../../../services/fleetServicesService'
import type { FleetServiceAssignmentSnapshot } from '../../../services/fleetServicesService'
import { createVehicle, updateVehicle, VehicleRequestError } from '../../../services/vehiclesService'
import {
  EMPTY_VEHICLE_FORM,
  normalizeLicensePlate,
  toVehicleAttributes,
  validateVehicleForm,
  vehicleToFormValues,
} from '../../../vehicles/vehicleForm'
import type { VehicleFormErrors, VehicleFormValues } from '../../../vehicles/vehicleForm'
import {
  VEHICLE_CATEGORIES,
  VEHICLE_CATEGORY_LABELS,
  VEHICLE_OPERATION_LABELS,
  VEHICLE_OPERATION_TYPES,
  VEHICLE_OWNERSHIP_LABELS,
  VEHICLE_OWNERSHIP_TYPES,
} from '../../../vehicles/vehicleTypes'
import type { Vehicle } from '../../../vehicles/vehicleTypes'

const OPERATION_OPTIONS = VEHICLE_OPERATION_TYPES.map((value) => ({
  value,
  label: VEHICLE_OPERATION_LABELS[value],
}))

const OWNERSHIP_OPTIONS = VEHICLE_OWNERSHIP_TYPES.map((value) => ({
  value,
  label: VEHICLE_OWNERSHIP_LABELS[value],
}))

const CATEGORY_OPTIONS = VEHICLE_CATEGORIES.map((value) => ({
  value,
  label: VEHICLE_CATEGORY_LABELS[value],
}))

interface VehicleFormDialogBaseProps {
  api: ApiRequest
  reportedBy: string
  onSaved: (vehicle: Vehicle) => void
  onPartialSaved: (vehicle: Vehicle, message: string) => void
  onCancel: () => void
  onConflict: (message: string) => void
}

type VehicleFormDialogProps = VehicleFormDialogBaseProps & (
  | { mode: 'create' }
  | { mode: 'edit'; vehicle: Vehicle }
)

type FocusableVehicleField = keyof VehicleFormErrors

const FIELD_FOCUS_ORDER: readonly FocusableVehicleField[] = [
  'licensePlate',
  'year',
  'seats',
  'bodyLimit',
  'categories',
  'reason',
]

function firstInvalidField(errors: VehicleFormErrors): FocusableVehicleField | null {
  return FIELD_FOCUS_ORDER.find((field) => Boolean(errors[field])) ?? null
}

/** Formulário de cadastro/edição com validação local e erro do campo vindo da API. */
export default function VehicleFormDialog(props: VehicleFormDialogProps) {
  const titleId = useId()
  const initialValues = props.mode === 'edit' ? vehicleToFormValues(props.vehicle) : EMPTY_VEHICLE_FORM
  const [values, setValues] = useState<VehicleFormValues>(initialValues)
  const [errors, setErrors] = useState<VehicleFormErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [focusRequest, setFocusRequest] = useState<{ field: FocusableVehicleField; seq: number } | null>(null)
  const [serviceAssignments, setServiceAssignments] = useState<FleetServiceAssignmentSnapshot[] | null>(null)
  const [serviceLoadError, setServiceLoadError] = useState<string | null>(null)
  const [serviceReload, setServiceReload] = useState(0)
  const [serviceConflict, setServiceConflict] = useState(false)
  const [serviceIds, setServiceIds] = useState<string[]>([])
  const [persistedVehicle, setPersistedVehicle] = useState<Vehicle | null>(null)
  const [vehicleAttributesChanged, setVehicleAttributesChanged] = useState(true)

  const editingVehicleId = props.mode === 'edit' ? props.vehicle.id : null

  const licensePlateRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const yearRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const seatsRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const bodyLimitRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const categoriesContainerRef = useRef<HTMLDivElement>(null)
  const reasonRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!focusRequest) return
    const target: HTMLElement | null = focusRequest.field === 'categories'
      ? categoriesContainerRef.current?.querySelector<HTMLElement>('[role="combobox"], input, select') ?? null
      : ({
          licensePlate: licensePlateRef.current,
          year: yearRef.current,
          seats: seatsRef.current,
          bodyLimit: bodyLimitRef.current,
          reason: reasonRef.current,
        })[focusRequest.field]
    if (!target) return
    target.focus()
    if (typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ block: 'nearest' })
    }
  }, [focusRequest])

  function requestFieldFocus(field: FocusableVehicleField) {
    setFocusRequest((current) => ({ field, seq: (current?.seq ?? 0) + 1 }))
  }

  useEffect(() => {
    let current = true
    setServiceAssignments(null)
    setServiceLoadError(null)
    void listFleetServiceAssignments(props.api)
      .then((snapshot) => {
        if (!current) return
        setServiceAssignments(snapshot)
        setServiceConflict(false)
        setServiceIds(editingVehicleId
          ? snapshot.filter(({ vehicleIds }) => vehicleIds.includes(editingVehicleId)).map(({ service }) => service.id)
          : [])
      })
      .catch((error: unknown) => {
        if (!current) return
        setServiceLoadError(error instanceof Error ? error.message : 'Não foi possível carregar os tipos de serviço.')
      })
    return () => { current = false }
  }, [props.api, editingVehicleId, serviceReload])

  function update<K extends keyof VehicleFormValues>(field: K, value: VehicleFormValues[K]) {
    setValues((current) => ({ ...current, [field]: value }))
    setVehicleAttributesChanged(true)
    setErrors((current) => {
      const next = { ...current }
      delete next[field as keyof VehicleFormErrors]
      return next
    })
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextErrors = validateVehicleForm(values)
    setErrors(nextErrors)
    const firstField = firstInvalidField(nextErrors)
    if (firstField) {
      requestFieldFocus(firstField)
      return
    }
    if (!serviceAssignments) {
      setSubmitError(serviceLoadError ?? 'Aguarde o carregamento dos tipos de serviço antes de salvar.')
      return
    }

    setSubmitting(true)
    setSubmitError(null)
    let savedVehicle = persistedVehicle
    let vehicleSavedThisAttempt = false

    try {
      if (!savedVehicle || vehicleAttributesChanged) {
        const attributes = toVehicleAttributes(values)
        const metadata = { reportedBy: props.reportedBy, reason: values.reason.trim() }
        savedVehicle = props.mode === 'edit' && !persistedVehicle
          ? await updateVehicle(props.api, props.vehicle.id, {
              ...attributes,
              ...metadata,
              expectedRevision: props.vehicle.revision,
            })
          : persistedVehicle
            ? await updateVehicle(props.api, persistedVehicle.id, {
                ...attributes,
                ...metadata,
                expectedRevision: persistedVehicle.revision,
              })
            : await createVehicle(props.api, { ...attributes, ...metadata })
        vehicleSavedThisAttempt = true
        setPersistedVehicle(savedVehicle)
        setVehicleAttributesChanged(false)
      }

      const result = await saveFleetServiceAssignments(
        props.api,
        savedVehicle.id,
        serviceIds,
        serviceAssignments,
        values.reason.trim(),
      )
      setServiceAssignments(result.snapshot)
      if (result.failedServices.length > 0) {
        setServiceConflict(true)
        const message = `O veículo foi salvo, mas houve conflito ao atualizar estes tipos de serviço: ${result.failedServices.join(', ')}. Recarregue a seleção, revise os vínculos atuais e salve novamente.`
        setSubmitError(message)
        props.onPartialSaved(savedVehicle, message)
        return
      }
      props.onSaved(savedVehicle)
    } catch (error) {
      if (savedVehicle && (vehicleSavedThisAttempt || !vehicleAttributesChanged)) {
        const message = `O veículo foi salvo, mas os vínculos dos tipos de serviço não foram atualizados. ${error instanceof Error ? error.message : 'Tente novamente.'}`
        setSubmitError(message)
        props.onPartialSaved(savedVehicle, message)
        return
      }
      if (error instanceof VehicleRequestError) {
        if (error.kind === 'conflict-plate') {
          setErrors((current) => ({ ...current, licensePlate: error.message }))
          requestFieldFocus('licensePlate')
          return
        }
        if (error.kind === 'conflict-revision') {
          props.onConflict(error.message)
          return
        }
        if (error.kind === 'forbidden') {
          setSubmitError('Seu perfil não tem permissão para salvar veículos.')
          return
        }
        setSubmitError(error.message)
        return
      }
      setSubmitError('Não foi possível salvar o veículo. Tente novamente.')
    } finally {
      setSubmitting(false)
    }
  }

  const title = props.mode === 'edit' ? 'Editar veículo' : 'Cadastrar veículo'

  return (
    <Dialog
      open
      onClose={submitting ? undefined : props.onCancel}
      aria-labelledby={titleId}
      fullWidth
      maxWidth="md"
      sx={accessibleControls}
    >
      <Box component="form" onSubmit={handleSubmit} noValidate>
        <DialogTitle id={titleId}>{title}</DialogTitle>
        <DialogContent dividers>
          {submitError && (
            <Alert
              severity="error"
              role="alert"
              sx={{ mb: 2 }}
              action={serviceConflict ? (
                <Button
                  color="inherit"
                  sx={{ minHeight: 44 }}
                  onClick={() => {
                    setSubmitError(null)
                    setServiceConflict(false)
                    setServiceReload((value) => value + 1)
                  }}
                >
                  Recarregar seleção
                </Button>
              ) : undefined}
            >
              {submitError}
            </Alert>
          )}
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <FormField
                label="Placa"
                value={values.licensePlate}
                onChange={(value) => update('licensePlate', normalizeLicensePlate(value))}
                error={errors.licensePlate}
                helperText="Formatos aceitos: ABC1234 ou ABC1D23."
                required
                autoComplete="off"
                maxLength={7}
                placeholder="ABC1D23"
                inputRef={licensePlateRef}
              />
              <FormField
                label="Ano"
                value={values.year}
                onChange={(value) => update('year', value)}
                error={errors.year}
                inputMode="numeric"
                maxLength={4}
                placeholder="2024"
                inputRef={yearRef}
              />
            </Stack>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <FormField
                label="Marca"
                value={values.brand}
                onChange={(value) => update('brand', value)}
                autoComplete="off"
              />
              <FormField
                label="Modelo"
                value={values.model}
                onChange={(value) => update('model', value)}
                autoComplete="off"
              />
            </Stack>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <FormField
                label="Tipo de veículo"
                value={values.vehicleType}
                onChange={(value) => update('vehicleType', value)}
                helperText="Ex.: Van, furgão, sedan."
                autoComplete="off"
              />
              <FormSelect
                label="Operação"
                value={values.operationType}
                onChange={(value) => update('operationType', value as VehicleFormValues['operationType'])}
                options={OPERATION_OPTIONS}
                required
              />
              <FormSelect
                label="Propriedade"
                value={values.ownership}
                onChange={(value) => update('ownership', value as VehicleFormValues['ownership'])}
                options={OWNERSHIP_OPTIONS}
                required
              />
            </Stack>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <FormField
                label="Capacidade de passageiros"
                value={values.seats}
                onChange={(value) => update('seats', value)}
                error={errors.seats}
                inputMode="numeric"
                required
                inputRef={seatsRef}
              />
              <FormField
                label="Limite de corpos"
                value={values.bodyLimit}
                onChange={(value) => update('bodyLimit', value)}
                error={errors.bodyLimit}
                inputMode="numeric"
                required
                inputRef={bodyLimitRef}
              />
            </Stack>

            <Box ref={categoriesContainerRef}>
              <FormSelect
                label="Categorias"
                value={values.categories}
                onChange={(value) => update('categories', value as VehicleFormValues['categories'])}
                options={CATEGORY_OPTIONS}
                multiple
                required
                error={errors.categories}
                helperText="Selecione ao menos uma categoria operacional."
              />
            </Box>

            {serviceLoadError ? (
              <Alert severity="error" role="alert" action={(
                <Button color="inherit" onClick={() => setServiceReload((value) => value + 1)}>
                  Tentar novamente
                </Button>
              )}>{serviceLoadError}</Alert>
            ) : (
              <FormSelect
                label="Tipos de serviço atendidos"
                value={serviceIds}
                onChange={setServiceIds}
                options={(serviceAssignments ?? [])
                  .filter(({ service, vehicleIds }) => service.active || (editingVehicleId && vehicleIds.includes(editingVehicleId)))
                  .map(({ service }) => ({ value: service.id, label: service.active ? service.name : `${service.name} (inativo)` }))}
                multiple
                disabled={submitting || serviceAssignments === null}
                helperText={serviceAssignments === null
                  ? 'Carregando tipos de serviço...'
                  : serviceAssignments.some(({ service }) => service.active)
                    ? 'Selecione os serviços que este veículo pode atender.'
                    : 'Não há tipos de serviço ativos disponíveis.'}
              />
            )}

            <FormField
              label="Justificativa"
              value={values.reason}
              onChange={(value) => update('reason', value)}
              error={errors.reason}
              helperText="Registrada na história do veículo e na auditoria."
              required
              multiline
              minRows={2}
              inputRef={reasonRef}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2, flexWrap: 'wrap', gap: 1 }}>
          <Button onClick={props.onCancel} disabled={submitting} color="inherit" sx={{ minHeight: 44 }}>
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={submitting || serviceAssignments === null || Boolean(serviceLoadError)}
            aria-busy={submitting ? 'true' : undefined}
            sx={{ minHeight: 44 }}
          >
            {submitting ? 'Salvando...' : persistedVehicle ? 'Salvar alterações' : props.mode === 'edit' ? 'Atualizar' : 'Cadastrar'}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  )
}
