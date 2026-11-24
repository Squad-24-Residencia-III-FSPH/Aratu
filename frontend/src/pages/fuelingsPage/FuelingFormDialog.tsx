import { useId, useRef, useState } from 'react'
import type { FocusEvent, FormEvent } from 'react'
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack } from '@mui/material'
import type { ApiRequest } from '../../api/client'
import { accessibleControls } from '../../components/ui/accessibleControls'
import { FormField, FormSelect } from '../../components/ui/FormField'
import type { FormSelectOption } from '../../components/ui/FormField'
import type { CreateFuelingInput, FuelingVersion } from '../../fuelings/fuelingTypes'
import { createFueling, FuelingRequestError, isUncertainFuelingOutcome, listFuelings } from '../../services/fuelingsService'
import {
  buildCanonicalFuelingSignature,
  localDateTimeValue,
  mapBackendFuelingError,
  matchesFuelingRecord,
  validateFuelingForm,
} from './fuelingForm'
import type { FuelingFieldErrors, FuelingFormField, FuelingFormValues } from './fuelingForm'

interface FuelingFormDialogProps {
  api: ApiRequest
  reportedBy: string
  vehicles: readonly FormSelectOption[]
  drivers: readonly FormSelectOption[]
  driversLoading?: boolean
  driversError?: string
  onRetryDrivers?: () => void
  onSaved: (saved: FuelingVersion, message?: string) => void
  onReconcileList?: () => void
  onCancel: () => void
}

const FUEL_OPTIONS: readonly FormSelectOption[] = [
  { value: 'GASOLINE', label: 'Gasolina' },
  { value: 'ETHANOL', label: 'Etanol' },
  { value: 'DIESEL', label: 'Diesel' },
  { value: 'DIESEL_S10', label: 'Diesel S10' },
  { value: 'GNV', label: 'GNV' },
  { value: 'FLEX', label: 'Flex' },
  { value: 'OTHER', label: 'Outro' },
]

/** Formulário acessível de abastecimento com validação por campo, idempotência por intenção e reconciliação. */
export default function FuelingFormDialog({
  api,
  reportedBy,
  vehicles,
  drivers,
  driversLoading = false,
  driversError = '',
  onRetryDrivers,
  onSaved,
  onReconcileList,
  onCancel,
}: FuelingFormDialogProps) {
  const titleId = useId()
  const [values, setValues] = useState<FuelingFormValues>(() => ({
    vehicleId: '',
    driverId: '',
    fueledAt: localDateTimeValue(new Date()),
    fuelType: '',
    liters: '',
    totalValue: '',
    odometerKm: '',
    station: '',
    reason: '',
    evidenceDescription: '',
  }))
  const [fieldErrors, setFieldErrors] = useState<FuelingFieldErrors>({})
  const [submitError, setSubmitError] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [uncertainInput, setUncertainInput] = useState<CreateFuelingInput | null>(null)
  const [saving, setSaving] = useState(false)
  const [reconciling, setReconciling] = useState(false)

  const submittingRef = useRef(false)
  const idempotencyAttemptRef = useRef<{ signature: string; key: string } | null>(null)
  const errorAlertRef = useRef<HTMLDivElement>(null)

  const vehicleBoxRef = useRef<HTMLDivElement>(null)
  const driverBoxRef = useRef<HTMLDivElement>(null)
  const fueledAtRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const fuelTypeBoxRef = useRef<HTMLDivElement>(null)
  const litersRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const totalValueRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const odometerKmRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const stationRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const reasonRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const evidenceDescriptionRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)

  function focusElement(element: HTMLElement | null | undefined) {
    if (!element) return
    element.focus()
    if (typeof element.scrollIntoView === 'function') {
      element.scrollIntoView({ block: 'nearest' })
    }
  }

  function focusField(field: FuelingFormField) {
    if (field === 'vehicleId') {
      focusElement(vehicleBoxRef.current?.querySelector<HTMLElement>('[role="combobox"]'))
      return
    }
    if (field === 'driverId') {
      focusElement(driverBoxRef.current?.querySelector<HTMLElement>('[role="combobox"]'))
      return
    }
    if (field === 'fuelType') {
      focusElement(fuelTypeBoxRef.current?.querySelector<HTMLElement>('[role="combobox"]'))
      return
    }
    const refs: Record<Exclude<FuelingFormField, 'vehicleId' | 'driverId' | 'fuelType'>, HTMLElement | null> = {
      fueledAt: fueledAtRef.current,
      liters: litersRef.current,
      totalValue: totalValueRef.current,
      odometerKm: odometerKmRef.current,
      station: stationRef.current,
      reason: reasonRef.current,
      evidenceDescription: evidenceDescriptionRef.current,
    }
    focusElement(refs[field])
  }

  function handleContentFocusCapture(event: FocusEvent<HTMLDivElement>) {
    const target = event.target
    if (!(target instanceof HTMLElement)) return
    const controlContainer = target.closest('.MuiFormControl-root') ?? target
    if (controlContainer instanceof HTMLElement && typeof controlContainer.scrollIntoView === 'function') {
      controlContainer.scrollIntoView({ block: 'nearest' })
    }
  }

  function update(field: FuelingFormField, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
    setFieldErrors((current) => {
      if (!current[field]) return current
      const next = { ...current }
      delete next[field]
      return next
    })
    setSubmitError('')
    setStatusMessage('')
    if (uncertainInput) {
      setUncertainInput(null)
    }
  }

  async function handleReconcile() {
    if (!uncertainInput || reconciling || saving) return
    setReconciling(true)
    setSubmitError('')
    setStatusMessage('Consultando lançamentos registrados para conferência...')
    try {
      const list = await listFuelings(api, {
        vehicleId: uncertainInput.vehicleId,
        page: 1,
        pageSize: 20,
      })
      onReconcileList?.()
      const match = list.items.find((item) => matchesFuelingRecord(item, uncertainInput))
      if (match) {
        idempotencyAttemptRef.current = null
        setUncertainInput(null)
        setStatusMessage('')
        onSaved(match, `Abastecimento #${match.id} já estava registrado. Listagem sincronizada sem duplicidade.`)
        return
      }
      setStatusMessage('')
      setSubmitError('Nenhum lançamento correspondente foi encontrado até o momento. Você pode reenviar com segurança mantendo os mesmos dados.')
      requestAnimationFrame(() => focusElement(errorAlertRef.current))
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : 'Não foi possível consultar os lançamentos.'
      setStatusMessage('')
      setSubmitError(`${message} Você ainda pode tentar consultar novamente ou reenviar mantendo a mesma intenção.`)
      requestAnimationFrame(() => focusElement(errorAlertRef.current))
    } finally {
      setReconciling(false)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submittingRef.current || reconciling) return

    const validation = validateFuelingForm(values, reportedBy)
    if (!validation.ok) {
      setFieldErrors(validation.fieldErrors)
      setSubmitError(validation.summary)
      setStatusMessage('')
      requestAnimationFrame(() => focusField(validation.firstInvalid))
      return
    }

    const { input } = validation
    const signature = buildCanonicalFuelingSignature(input)
    if (idempotencyAttemptRef.current?.signature !== signature) {
      idempotencyAttemptRef.current = { signature, key: crypto.randomUUID() }
    }

    submittingRef.current = true
    setSaving(true)
    setFieldErrors({})
    setSubmitError('')
    setStatusMessage('Registrando abastecimento, aguarde...')

    try {
      const saved = await createFueling(api, input, idempotencyAttemptRef.current.key)
      idempotencyAttemptRef.current = null
      setUncertainInput(null)
      setStatusMessage('')
      onSaved(saved)
    } catch (requestError) {
      const rawMessage = requestError instanceof Error
        ? requestError.message
        : 'Não foi possível registrar o abastecimento.'

      if (requestError instanceof FuelingRequestError && requestError.status === 409) {
        idempotencyAttemptRef.current = null
        setUncertainInput(null)
        setStatusMessage('')
        setSubmitError(rawMessage)
        requestAnimationFrame(() => focusElement(errorAlertRef.current))
        return
      }

      if (isUncertainFuelingOutcome(requestError)) {
        setUncertainInput(input)
        setStatusMessage('')
        setSubmitError(`${rawMessage} Não foi possível confirmar se o abastecimento foi gravado. Consulte os lançamentos ou reenvie com segurança usando a mesma intenção.`)
        requestAnimationFrame(() => focusElement(errorAlertRef.current))
        return
      }

      setUncertainInput(null)
      setStatusMessage('')
      const mapped = mapBackendFuelingError(rawMessage)
      if (mapped.field) {
        const targetField = mapped.field
        setFieldErrors({ [targetField]: mapped.message })
        setSubmitError(mapped.message)
        requestAnimationFrame(() => focusField(targetField))
      } else {
        setSubmitError(mapped.message)
        requestAnimationFrame(() => focusElement(errorAlertRef.current))
      }
    } finally {
      submittingRef.current = false
      setSaving(false)
    }
  }

  const busy = saving || reconciling

  return (
    <Dialog
      open
      onClose={busy ? undefined : onCancel}
      fullWidth
      maxWidth="sm"
      aria-labelledby={titleId}
      sx={accessibleControls}
      slotProps={{
        paper: {
          sx: {
            m: { xs: 1.5, sm: 3 },
            width: { xs: 'calc(100% - 24px)', sm: '100%' },
            maxHeight: 'calc(100dvh - 24px)',
          },
        },
      }}
    >
      <Box component="form" onSubmit={handleSubmit} aria-busy={busy ? 'true' : undefined} noValidate>
        <DialogTitle id={titleId}>Registrar abastecimento</DialogTitle>
        <DialogContent
          dividers
          onFocusCapture={handleContentFocusCapture}
          sx={{
            scrollPaddingBlock: 3,
            '& .MuiFormControl-root': { scrollMarginBlock: 24 },
          }}
        >
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            {statusMessage && (
              <Alert severity="info" role="status" aria-live="polite">
                {statusMessage}
              </Alert>
            )}
            {submitError && (
              <Alert
                ref={errorAlertRef}
                tabIndex={-1}
                severity={uncertainInput ? 'warning' : 'error'}
                role="alert"
                action={uncertainInput ? (
                  <Button
                    type="button"
                    size="small"
                    variant="outlined"
                    onClick={handleReconcile}
                    disabled={busy}
                  >
                    {reconciling ? 'Consultando...' : 'Consultar lançamentos'}
                  </Button>
                ) : undefined}
              >
                {submitError}
              </Alert>
            )}
            <Box ref={vehicleBoxRef}>
              <FormSelect
                label="Veículo"
                value={values.vehicleId}
                onChange={(value) => update('vehicleId', value)}
                options={vehicles}
                emptyLabel="Selecione um veículo"
                error={fieldErrors.vehicleId}
                disabled={busy}
                required
                autoFocus
              />
            </Box>
            <Box ref={driverBoxRef}>
              <FormSelect
                label="Motorista (opcional)"
                value={values.driverId}
                onChange={(value) => update('driverId', value)}
                options={drivers}
                emptyLabel="Não informado"
                error={fieldErrors.driverId}
                helperText={driversError
                  ? 'Catálogo de motoristas indisponível. Você pode registrar sem motorista ou consultar novamente.'
                  : undefined}
                disabled={busy}
              />
              {driversError && onRetryDrivers && (
                <Box sx={{ mt: 0.5 }}>
                  <Button
                    type="button"
                    size="small"
                    variant="outlined"
                    onClick={onRetryDrivers}
                    disabled={busy || driversLoading}
                  >
                    {driversLoading ? 'Recarregando motoristas...' : 'Recarregar motoristas'}
                  </Button>
                </Box>
              )}
            </Box>
            <FormField
              label="Data e hora"
              type="datetime-local"
              value={values.fueledAt}
              onChange={(value) => update('fueledAt', value)}
              error={fieldErrors.fueledAt}
              inputRef={fueledAtRef}
              disabled={busy}
              required
            />
            <Box ref={fuelTypeBoxRef}>
              <FormSelect
                label="Tipo de combustível"
                value={values.fuelType}
                onChange={(value) => update('fuelType', value)}
                options={FUEL_OPTIONS}
                emptyLabel="Selecione o combustível"
                error={fieldErrors.fuelType}
                disabled={busy}
                required
              />
            </Box>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <FormField
                label="Litros"
                value={values.liters}
                onChange={(value) => update('liters', value)}
                error={fieldErrors.liters}
                inputRef={litersRef}
                placeholder="Ex.: 26,375"
                helperText="Até 3 casas decimais."
                disabled={busy}
                required
              />
              <FormField
                label="Valor total (R$)"
                value={values.totalValue}
                onChange={(value) => update('totalValue', value)}
                error={fieldErrors.totalValue}
                inputRef={totalValueRef}
                placeholder="Ex.: 153,40"
                helperText="Até 2 casas decimais."
                disabled={busy}
                required
              />
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <FormField
                label="Quilometragem (km)"
                value={values.odometerKm}
                onChange={(value) => update('odometerKm', value)}
                error={fieldErrors.odometerKm}
                inputRef={odometerKmRef}
                inputMode="numeric"
                helperText="Inteiro maior ou igual a zero."
                disabled={busy}
                required
              />
              <FormField
                label="Posto (opcional)"
                value={values.station}
                onChange={(value) => update('station', value)}
                error={fieldErrors.station}
                inputRef={stationRef}
                disabled={busy}
              />
            </Stack>
            <FormField
              label="Justificativa do registro"
              value={values.reason}
              onChange={(value) => update('reason', value)}
              error={fieldErrors.reason}
              inputRef={reasonRef}
              disabled={busy}
              required
              multiline
              minRows={2}
            />
            <FormField
              label="Descrição da evidência"
              value={values.evidenceDescription}
              onChange={(value) => update('evidenceDescription', value)}
              error={fieldErrors.evidenceDescription}
              inputRef={evidenceDescriptionRef}
              helperText="Informe o comprovante ou canal em que foi registrado."
              disabled={busy}
              required
              multiline
              minRows={2}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2, flexWrap: 'wrap', gap: 1 }}>
          <Button type="button" onClick={onCancel} disabled={busy}>
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={busy}
            aria-busy={saving ? 'true' : undefined}
          >
            {saving
              ? 'Registrando...'
              : uncertainInput
                ? 'Reenviar com segurança'
                : 'Registrar abastecimento'}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  )
}
