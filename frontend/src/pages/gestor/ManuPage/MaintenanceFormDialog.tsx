import { useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack } from '@mui/material'
import type { ApiRequest } from '../../../api/client'
import { FormField, FormSelect } from '../../../components/ui/FormField'
import type { Vehicle } from '../../../vehicles/vehicleTypes'
import { TYPE_LABELS, MAINTENANCE_TYPES } from '../../../maintenance/maintenanceTypes'
import type { MaintenanceOrder, MaintenanceItem, MaintenanceType, CreateMaintenanceInput } from '../../../maintenance/maintenanceTypes'
import { getOdometerError, normalizeFormItems, parseOdometer } from '../../../maintenance/maintenanceForm'
import { createMaintenance, updateMaintenance, MaintenanceRequestError } from '../../../services/maintenanceService'
import { ItemsEditor } from './MaintenanceItems'
import { maintenanceControls } from './maintenanceStyles'

interface MaintenanceFormDialogProps {
  /** A ordem recebida fixa veículo, data de entrada, autoria e revisão durante a edição. */
  order?: MaintenanceOrder
  vehicles: readonly Vehicle[]
  api: ApiRequest
  onClose: () => void
  onSaved: (order: MaintenanceOrder) => void
  onConflict: () => void
}
/** Persiste orçamento e metadados, mantendo chave de idempotência por conteúdo da abertura. */
export default function MaintenanceFormDialog({ order, vehicles, api, onClose, onSaved, onConflict }: MaintenanceFormDialogProps) {
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
  const [busy, setBusy] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const submitting = useRef(false)
  const attempt = useRef<{ payload: string; key: string } | null>(null)
  const odometerError = getOdometerError(odometer)
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (submitting.current || conflict) return
    setSubmitted(true)
    if (!vehicleId || !description.trim() || !reportedBy.trim() || !reason.trim() || odometerError) {
      setError('Corrija os campos indicados antes de salvar.'); return
    }
    submitting.current = true
    setBusy(true); setError('')
    try {
      const attributes = { type, description: description.trim(), workshop: workshop.trim() || null,
        odometerKm: parseOdometer(odometer), expectedCompletionDate: expectedDate || null, blocksVehicle,
        estimateItems: hasEstimate ? normalizeFormItems(estimateItems) : null, reportedBy: reportedBy.trim(), reason: reason.trim() }
      let saved: MaintenanceOrder
      if (order) saved = await updateMaintenance(api, order.id, { ...attributes, expectedRevision: order.revision })
      else {
        const input: CreateMaintenanceInput = { ...attributes, vehicleId,
          ...(openedAt ? { openedAt: new Date(openedAt).toISOString() } : {}) }
        const payload = JSON.stringify(input)
        if (attempt.current?.payload !== payload) attempt.current = { payload, key: crypto.randomUUID() }
        saved = await createMaintenance(api, input, attempt.current.key)
      }
      onSaved(saved)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível salvar a manutenção.')
      if (order && failure instanceof MaintenanceRequestError && failure.status === 409) setConflict(true)
    } finally { submitting.current = false; setBusy(false) }
  }
  const vehicleOptions = vehicles.map(vehicle => ({ value: vehicle.id, label: `${vehicle.licensePlate} — ${vehicle.model ?? 'Modelo não informado'}` }))
  if (order && !vehicleOptions.some(vehicle => vehicle.value === order.vehicleId)) {
    vehicleOptions.push({ value: order.vehicleId, label: order.vehicleSnapshot?.licensePlate ?? `Veículo ${order.vehicleId}` })
  }
  return <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="md" aria-labelledby={`${id}-title`} sx={maintenanceControls}>
    <DialogTitle id={`${id}-title`}>{order ? `Editar ordem #${order.id}` : 'Registrar Manutenção'}</DialogTitle>
    <form onSubmit={submit} aria-busy={busy} noValidate>
      <DialogContent dividers><Stack spacing={2.5}>
        {error && <Alert severity="error" role="alert" action={conflict ? <Button onClick={onConflict}>Recarregar ordem</Button> : undefined}>{error}</Alert>}
        <FormSelect label="Veículo" value={vehicleId} options={vehicleOptions} emptyLabel="Selecione o veículo" onChange={setVehicleId}
          required error={submitted && !vehicleId ? 'Selecione o veículo.' : undefined} disabled={busy || Boolean(order)} autoFocus />
        <FormSelect label="Tipo de manutenção" value={type} options={MAINTENANCE_TYPES.map(value => ({ value, label: TYPE_LABELS[value] }))}
          onChange={value => setType(value as MaintenanceType)} disabled={busy} required />
        <FormField label="Descrição da manutenção" value={description} onChange={setDescription} required disabled={busy} multiline
          error={submitted && !description.trim() ? 'Informe a descrição da manutenção.' : undefined} />
        <FormField label="Oficina responsável" value={workshop} onChange={setWorkshop} disabled={busy} />
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <FormField label="Hodômetro (km)" value={odometer} onChange={setOdometer} disabled={busy} inputMode="numeric"
            error={submitted ? odometerError : undefined} helperText="Opcional; inteiro não negativo." />
          <FormField label="Previsão de término" value={expectedDate} onChange={setExpectedDate} type="date" disabled={busy} />
        </Stack>
        {!order && <FormField label="Entrada na oficina" value={openedAt} onChange={setOpenedAt} type="datetime-local" disabled={busy}
          helperText="Opcional; em branco registra o instante atual. Horário local deste dispositivo." />}
        <FormSelect label="Manutenção impeditiva?" value={blocksVehicle ? 'yes' : 'no'} onChange={value => setBlocksVehicle(value === 'yes')}
          options={[{ value: 'yes', label: 'Sim — bloquear veículo' }, { value: 'no', label: 'Não — manter disponibilidade' }]} disabled={busy} />
        <FormSelect label="Orçamento" value={hasEstimate ? 'yes' : 'no'} onChange={value => setHasEstimate(value === 'yes')}
          options={[{ value: 'no', label: 'Ainda não informado' }, { value: 'yes', label: 'Informar peças e serviços orçados' }]} disabled={busy} />
        {hasEstimate && <ItemsEditor label="Itens orçados" items={estimateItems} onChange={setEstimateItems} disabled={busy} validate={submitted} />}
        <FormField label="Origem da informação" value={reportedBy} onChange={setReportedBy} required disabled={busy}
          error={submitted && !reportedBy.trim() ? 'Informe a origem da informação.' : undefined} helperText="Identifique quem informou e o canal ou documento de origem." />
        <FormField label="Justificativa" value={reason} onChange={setReason} required disabled={busy} multiline
          error={submitted && !reason.trim() ? 'Informe a justificativa.' : undefined} />
      </Stack></DialogContent>
      <DialogActions sx={{ p: 2, flexWrap: 'wrap' }}>
        <Button color="inherit" onClick={onClose} disabled={busy}>Cancelar</Button>
        <Button type="submit" variant="contained" disabled={busy || conflict || (!order && vehicles.length === 0)}>{busy ? 'Salvando...' : order ? 'Salvar alterações' : 'Salvar manutenção'}</Button>
      </DialogActions>
    </form>
  </Dialog>
}
