import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack } from '@mui/material'
import type { ApiRequest } from '../../../api/client'
import { FormField, FormSelect } from '../../../components/ui/FormField'
import type { Vehicle } from '../../../vehicles/vehicleTypes'
import { isActiveOrder, TYPE_LABELS, MAINTENANCE_TYPES } from '../../../maintenance/maintenanceTypes'
import type { MaintenanceOrder, MaintenanceItem, MaintenanceType, CreateMaintenanceInput } from '../../../maintenance/maintenanceTypes'
import { normalizeFormItems, parseOdometer } from '../../../maintenance/maintenanceForm'
import { createMaintenance, listMaintenance, MaintenanceRequestError, updateMaintenance } from '../../../services/maintenanceService'
import { ItemsEditor } from './MaintenanceItems'
import { accessibleControls } from '../../../components/ui/accessibleControls'
import {
  isBlockingOrderConflict,
  isRevisionConflict,
  validateMaintenanceFormFields,
} from './maintenancePresentation'
import type { ItemValidationFailure, MaintenanceFormFieldKey } from './maintenancePresentation'

interface MaintenanceFormDialogProps {
  /** A ordem recebida fixa veículo, data de entrada, autoria e revisão durante a edição. */
  order?: MaintenanceOrder
  vehicles: readonly Vehicle[]
  api: ApiRequest
  onClose: () => void
  onSaved: (order: MaintenanceOrder) => void
  onConflict: () => void
  onInspectOrder: (orderId: string) => void
  onFilterByVehicle: (vehicleId: string) => void
}

interface BlockingConflictInfo {
  vehicleId: string
  plateLabel: string
  blockingOrder: MaintenanceOrder | null
  blockingOrderId: string | null
}

function focusItemInput(
  container: HTMLDivElement | null,
  failure: ItemValidationFailure | null,
  items: readonly MaintenanceItem[],
) {
  if (!container || !failure) return
  const card = container.querySelector<HTMLElement>(`[data-item-index="${failure.index}"]`)
  if (!card) return
  const inputs = card.querySelectorAll<HTMLElement>('input, textarea')
  const item = items[failure.index]
  let offset = 0
  if (failure.field === 'quantity' || failure.field === 'amount') offset = 1
  else if (failure.field === 'unitPrice' && item?.kind === 'PART') offset = 2
  inputs[offset]?.focus()
}

/** Persiste orçamento e metadados, mantendo chave de idempotência por conteúdo da abertura. */
export default function MaintenanceFormDialog({
  order,
  vehicles,
  api,
  onClose,
  onSaved,
  onConflict,
  onInspectOrder,
  onFilterByVehicle,
}: MaintenanceFormDialogProps) {
  const id = useId()
  const [vehicleId, setVehicleId] = useState(order?.vehicleId ?? '')
  const [type, setType] = useState<MaintenanceType>(order?.type ?? 'CORRECTIVE')
  const [description, setDescription] = useState(order?.description ?? '')
  const [workshop, setWorkshop] = useState(order?.workshop ?? '')
  const [odometer, setOdometer] = useState(order?.odometerKm?.toString() ?? '')
  const [expectedDate, setExpectedDate] = useState(order?.expectedCompletionDate ?? '')
  const [openedAt, setOpenedAt] = useState('')
  const [blocksVehicle, setBlocksVehicle] = useState(order?.blocksVehicle ?? false)
  const [hasEstimate, setHasEstimate] = useState(order?.estimateItems != null)
  const [estimateItems, setEstimateItems] = useState<MaintenanceItem[]>(order?.estimateItems ?? [])
  const [reportedBy, setReportedBy] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState(false)
  const [blockingConflict, setBlockingConflict] = useState<BlockingConflictInfo | null>(null)
  const [busy, setBusy] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const submitting = useRef(false)
  const mounted = useRef(true)
  const attempt = useRef<{ payload: string; key: string } | null>(null)

  const vehicleWrapperRef = useRef<HTMLDivElement>(null)
  const descriptionRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const odometerRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const expectedDateRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const openedAtRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const itemsContainerRef = useRef<HTMLDivElement>(null)
  const reportedByRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const reasonRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const errorAlertRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const validation = validateMaintenanceFormFields({
    isEditing: Boolean(order),
    vehicleId,
    description,
    odometer,
    expectedDate,
    openedAt,
    existingOpenedAt: order?.openedAt,
    hasEstimate,
    estimateItems,
    reportedBy,
    reason,
  })

  function focusField(
    field: MaintenanceFormFieldKey | null,
    itemFailure: ItemValidationFailure | null,
  ) {
    if (!field) return
    if (field === 'vehicleId') {
      vehicleWrapperRef.current?.querySelector<HTMLElement>('[role="combobox"], input')?.focus()
      return
    }
    if (field === 'estimateItems') {
      focusItemInput(itemsContainerRef.current, itemFailure, estimateItems)
      return
    }
    const refs: Record<Exclude<MaintenanceFormFieldKey, 'vehicleId' | 'estimateItems'>, typeof descriptionRef> = {
      description: descriptionRef,
      odometer: odometerRef,
      expectedDate: expectedDateRef,
      openedAt: openedAtRef,
      reportedBy: reportedByRef,
      reason: reasonRef,
    }
    refs[field].current?.focus()
  }

  async function resolveBlockingOrderDetails(targetVehicleId: string, apiBlockingOrderId?: string) {
    const vehicle = vehicles.find((item) => item.id === targetVehicleId)
    const plateLabel = vehicle?.licensePlate
      ?? (order?.vehicleId === targetVehicleId ? order.vehicleSnapshot?.licensePlate : undefined)
      ?? `Veículo ${targetVehicleId}`

    let blockingOrder: MaintenanceOrder | null = null
    let resolvedId: string | null = apiBlockingOrderId ?? null
    try {
      const list = await listMaintenance(api, { vehicleId: targetVehicleId })
      const activeBlocking = list.items.filter(
        (item) => isActiveOrder(item) && item.blocksVehicle && item.id !== order?.id,
      )
      blockingOrder = (resolvedId
        ? activeBlocking.find((item) => item.id === resolvedId)
        : undefined) ?? activeBlocking[0] ?? null
      if (!resolvedId && blockingOrder) resolvedId = blockingOrder.id
    } catch {
      // Sem resposta autorizada adicional: orienta consultar as ordens do veículo sem inventar ID.
    }

    if (!mounted.current) return
    setBlockingConflict({
      vehicleId: targetVehicleId,
      plateLabel,
      blockingOrder,
      blockingOrderId: resolvedId,
    })
    if (blockingOrder) {
      setError(
        `Já existe uma manutenção impeditiva ativa para o veículo ${plateLabel} (ID ${targetVehicleId}): `
        + `ordem #${blockingOrder.id} (${TYPE_LABELS[blockingOrder.type]}). `
        + `Consulte a ordem #${blockingOrder.id} ou as ordens impeditivas deste veículo antes de prosseguir.`,
      )
    } else if (resolvedId) {
      setError(
        `Já existe uma manutenção impeditiva ativa para o veículo ${plateLabel} (ID ${targetVehicleId}): `
        + `ordem #${resolvedId}. Consulte a ordem #${resolvedId} ou as ordens deste veículo.`,
      )
    } else {
      setError(
        `Já existe uma manutenção impeditiva ativa para o veículo ${plateLabel} (ID ${targetVehicleId}). `
        + 'Consulte as ordens impeditivas em aberto deste veículo antes de prosseguir.',
      )
    }
    errorAlertRef.current?.focus()
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (submitting.current || conflict) return
    setSubmitted(true)
    setBlockingConflict(null)

    if (!validation.valid) {
      setError('Corrija os campos indicados antes de salvar.')
      focusField(validation.firstInvalidField, validation.firstInvalidEstimateItem)
      return
    }

    submitting.current = true
    setBusy(true)
    setError('')
    try {
      const attributes = {
        type,
        description: description.trim(),
        workshop: workshop.trim() || null,
        odometerKm: parseOdometer(odometer),
        expectedCompletionDate: expectedDate || null,
        blocksVehicle,
        estimateItems: hasEstimate ? normalizeFormItems(estimateItems) : null,
        reportedBy: reportedBy.trim(),
        reason: reason.trim(),
      }
      let saved: MaintenanceOrder
      if (order) {
        saved = await updateMaintenance(api, order.id, { ...attributes, expectedRevision: order.revision })
      } else {
        const input: CreateMaintenanceInput = {
          ...attributes,
          vehicleId,
          ...(openedAt ? { openedAt: new Date(openedAt).toISOString() } : {}),
        }
        const payload = JSON.stringify(input)
        if (attempt.current?.payload !== payload) attempt.current = { payload, key: crypto.randomUUID() }
        saved = await createMaintenance(api, input, attempt.current.key)
      }
      onSaved(saved)
    } catch (failure) {
      if (isBlockingOrderConflict(failure)) {
        const message = failure instanceof Error ? failure.message : 'Já existe uma manutenção impeditiva ativa.'
        const blockingOrderId = failure instanceof MaintenanceRequestError ? failure.blockingOrderId : undefined
        setError(message)
        await resolveBlockingOrderDetails(order?.vehicleId ?? vehicleId, blockingOrderId)
      } else if (isRevisionConflict(failure, Boolean(order))) {
        setError(failure instanceof Error ? failure.message : 'A ordem foi alterada ou encerrada.')
        setConflict(true)
        requestAnimationFrame(() => errorAlertRef.current?.focus())
      } else {
        const message = failure instanceof Error ? failure.message : 'Não foi possível salvar a manutenção.'
        setError(message)
        if (/previsão/i.test(message)) expectedDateRef.current?.focus()
        else if (/quilometragem|hodômetro/i.test(message)) odometerRef.current?.focus()
        else if (/descrição/i.test(message)) descriptionRef.current?.focus()
        else if (/origem|reportedBy/i.test(message)) reportedByRef.current?.focus()
        else if (/justificativa|reason/i.test(message)) reasonRef.current?.focus()
        else requestAnimationFrame(() => errorAlertRef.current?.focus())
      }
    } finally {
      submitting.current = false
      if (mounted.current) setBusy(false)
    }
  }

  const vehicleOptions = vehicles.map((vehicle) => ({
    value: vehicle.id,
    label: `${vehicle.licensePlate} — ${vehicle.model ?? 'Modelo não informado'}`,
  }))
  if (order && !vehicleOptions.some((vehicle) => vehicle.value === order.vehicleId)) {
    vehicleOptions.push({
      value: order.vehicleId,
      label: order.vehicleSnapshot?.licensePlate ?? `Veículo ${order.vehicleId}`,
    })
  }

  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="md" aria-labelledby={`${id}-title`} sx={accessibleControls}>
      <DialogTitle id={`${id}-title`}>{order ? `Editar ordem #${order.id}` : 'Registrar Manutenção'}</DialogTitle>
      <form onSubmit={submit} aria-busy={busy} noValidate>
        <DialogContent dividers>
          <Stack spacing={2.5}>
            {error && (
              <Alert
                ref={errorAlertRef}
                tabIndex={-1}
                severity="error"
                role="alert"
                action={conflict
                  ? <Button onClick={onConflict}>Recarregar ordem</Button>
                  : blockingConflict
                    ? (
                      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                        {blockingConflict.blockingOrderId && (
                          <Button onClick={() => onInspectOrder(blockingConflict.blockingOrderId!)}>
                            Consultar ordem #{blockingConflict.blockingOrderId}
                          </Button>
                        )}
                        <Button onClick={() => onFilterByVehicle(blockingConflict.vehicleId)}>
                          Ver ordens do veículo
                        </Button>
                      </Stack>
                    )
                    : undefined}
              >
                {error}
              </Alert>
            )}
            <Box ref={vehicleWrapperRef}>
              <FormSelect
                label="Veículo"
                value={vehicleId}
                options={vehicleOptions}
                emptyLabel="Selecione o veículo"
                onChange={(value) => { setVehicleId(value); setBlockingConflict(null) }}
                required
                error={submitted ? validation.errors.vehicleError : undefined}
                disabled={busy || Boolean(order)}
                autoFocus={!order}
              />
            </Box>
            <FormSelect
              label="Tipo de manutenção"
              value={type}
              options={MAINTENANCE_TYPES.map((value) => ({ value, label: TYPE_LABELS[value] }))}
              onChange={(value) => setType(value as MaintenanceType)}
              disabled={busy}
              required
            />
            <FormField
              label="Descrição da manutenção"
              value={description}
              onChange={setDescription}
              required
              disabled={busy}
              multiline
              inputRef={descriptionRef}
              autoFocus={Boolean(order)}
              error={submitted ? validation.errors.descriptionError : undefined}
            />
            <FormField label="Oficina responsável" value={workshop} onChange={setWorkshop} disabled={busy} />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <FormField
                label="Hodômetro (km)"
                value={odometer}
                onChange={setOdometer}
                disabled={busy}
                inputMode="numeric"
                inputRef={odometerRef}
                error={submitted ? validation.errors.odometerError : undefined}
                helperText="Opcional; inteiro não negativo."
              />
              <FormField
                label="Previsão de término"
                value={expectedDate}
                onChange={setExpectedDate}
                type="date"
                disabled={busy}
                inputRef={expectedDateRef}
                error={submitted ? validation.errors.expectedDateError : undefined}
                helperText="Opcional; não pode anteceder a data de entrada."
              />
            </Stack>
            {!order && (
              <FormField
                label="Entrada na oficina"
                value={openedAt}
                onChange={setOpenedAt}
                type="datetime-local"
                disabled={busy}
                inputRef={openedAtRef}
                error={submitted ? validation.errors.openedAtError : undefined}
                helperText="Opcional; em branco registra o instante atual. Horário local deste dispositivo."
              />
            )}
            <FormSelect
              label="Manutenção impeditiva?"
              value={blocksVehicle ? 'yes' : 'no'}
              onChange={(value) => { setBlocksVehicle(value === 'yes'); setBlockingConflict(null) }}
              options={[
                { value: 'yes', label: 'Sim — bloquear veículo' },
                { value: 'no', label: 'Não — manter disponibilidade' },
              ]}
              disabled={busy}
            />
            <FormSelect
              label="Orçamento"
              value={hasEstimate ? 'yes' : 'no'}
              onChange={(value) => setHasEstimate(value === 'yes')}
              options={[
                { value: 'no', label: 'Ainda não informado' },
                { value: 'yes', label: 'Informar peças e serviços orçados' },
              ]}
              disabled={busy}
            />
            {hasEstimate && (
              <ItemsEditor
                label="Itens orçados"
                items={estimateItems}
                onChange={setEstimateItems}
                disabled={busy}
                validate={submitted}
                containerRef={itemsContainerRef}
              />
            )}
            <FormField
              label="Origem da informação"
              value={reportedBy}
              onChange={setReportedBy}
              required
              disabled={busy}
              inputRef={reportedByRef}
              error={submitted ? validation.errors.reportedByError : undefined}
              helperText="Identifique quem informou e o canal ou documento de origem."
            />
            <FormField
              label="Justificativa"
              value={reason}
              onChange={setReason}
              required
              disabled={busy}
              multiline
              inputRef={reasonRef}
              error={submitted ? validation.errors.reasonError : undefined}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2, flexWrap: 'wrap' }}>
          <Button color="inherit" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button type="submit" variant="contained" disabled={busy || conflict || (!order && vehicles.length === 0)}>
            {busy ? 'Salvando...' : order ? 'Salvar alterações' : 'Salvar manutenção'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
