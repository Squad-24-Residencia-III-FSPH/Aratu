import { useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack } from '@mui/material'
import type { ApiRequest } from '../../api/client'
import { FormField, FormSelect } from '../../components/ui/FormField'
import type { FormSelectOption } from '../../components/ui/FormField'
import { createFueling, FuelingWriteError, rectifyFueling } from '../../services/fuelingsService'
import type { CreateFuelingInput, FuelingVersion, RectifyFuelingInput } from '../../fuelings/fuelingTypes'
import { operationalDateTimeInput, operationalDateTimeToIso } from '../../time/operationalTime'

interface FuelingFormDialogProps {
  api: ApiRequest
  reportedBy: string
  vehicles: readonly FormSelectOption[]
  drivers: readonly FormSelectOption[]
  onSaved: () => void
  onCancel: () => void
  fueling?: FuelingVersion
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

type FuelingSubmission =
  | {
  kind: 'create'
  key: string
  input: CreateFuelingInput
}
  | { kind: 'rectify'; targetId: string; key: string; input: RectifyFuelingInput }

export default function FuelingFormDialog({ api, reportedBy, vehicles, drivers, onSaved, onCancel, fueling }: FuelingFormDialogProps) {
  const titleId = useId()
  const [values, setValues] = useState({
    vehicleId: fueling?.vehicleId ?? '', driverId: fueling?.driverId ?? '', fueledAt: operationalDateTimeInput(fueling?.fueledAt ?? new Date().toISOString()), fuelType: fueling?.fuelType ?? '',
    liters: fueling?.liters ?? '', totalValue: fueling?.totalValue ?? '', odometerKm: fueling ? String(fueling.odometerKm) : '', station: fueling?.station ?? '',
    notes: '', reason: '', evidenceDescription: '',
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [outcomeUncertain, setOutcomeUncertain] = useState(false)
  const submission = useRef<FuelingSubmission | null>(null)

  function update(field: keyof typeof values, value: string) {
    if (outcomeUncertain) return
    setValues((current) => ({ ...current, [field]: value }))
    setError('')
  }

  async function sendSubmission(current: FuelingSubmission) {
    setSaving(true)
    setError('')
    try {
      if (current.kind === 'rectify') await rectifyFueling(api, current.targetId, current.input, current.key)
      else await createFueling(api, current.input, current.key)
      submission.current = null
      onSaved()
    } catch (requestError) {
      const uncertain = requestError instanceof FuelingWriteError && requestError.outcomeUncertain
      setOutcomeUncertain(uncertain)
      if (!uncertain) submission.current = null
      const message = requestError instanceof Error
        ? requestError.message
        : 'Não foi possível registrar o abastecimento.'
      setError(uncertain
        ? `${message} Os dados foram preservados. Tente novamente para confirmar o mesmo registro.`
        : message)
    } finally {
      setSaving(false)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (outcomeUncertain && submission.current) {
      await sendSubmission(submission.current)
      return
    }
    const odometerKm = Number(values.odometerKm)
    if (!values.vehicleId || !values.fueledAt || !values.fuelType || !values.liters || !values.totalValue
      || values.odometerKm === '' || !values.reason.trim() || !values.evidenceDescription.trim()
      || !Number.isInteger(odometerKm) || odometerKm < 0) {
      setError('Preencha os campos obrigatórios e informe uma quilometragem inteira não negativa.')
      return
    }

    const input: CreateFuelingInput = {
      vehicleId: values.vehicleId,
      ...(values.driverId ? { driverId: values.driverId } : {}),
      fueledAt: operationalDateTimeToIso(values.fueledAt),
      fuelType: values.fuelType as CreateFuelingInput['fuelType'],
      liters: values.liters,
      totalValue: values.totalValue,
      odometerKm,
      ...(values.station.trim() ? { station: values.station.trim() } : {}),
      reportedBy,
      reason: values.reason.trim(),
      evidenceDescription: values.evidenceDescription.trim(),
      notes: values.notes.trim() || null,
    }

    if (fueling) {
      if (!fueling.revision) { setError('A revisão atual do abastecimento não está disponível. Atualize a consulta antes de corrigir.'); return }
      const rectifyInput: RectifyFuelingInput = {
        expectedRevision: fueling.revision, ...(values.driverId ? { driverId: values.driverId } : { driverId: null }),
        fueledAt: input.fueledAt, fuelType: input.fuelType, liters: input.liters, totalValue: input.totalValue,
        odometerKm: input.odometerKm, station: input.station ?? null, notes: input.notes ?? null,
        reportedBy: input.reportedBy, reason: input.reason, evidenceDescription: input.evidenceDescription,
      }
      const current: FuelingSubmission = { kind: 'rectify', targetId: fueling.id, key: crypto.randomUUID(), input: rectifyInput }
      submission.current = current
      await sendSubmission(current)
      return
    }
    const current: FuelingSubmission = { kind: 'create', key: crypto.randomUUID(), input }
    submission.current = current
    await sendSubmission(current)
  }

  return (
    <Dialog open onClose={saving || outcomeUncertain ? undefined : onCancel} fullWidth maxWidth="sm" aria-labelledby={titleId}>
      <Box component="form" onSubmit={handleSubmit} noValidate>
        <DialogTitle id={titleId}>{fueling ? `Corrigir abastecimento #${fueling.id}` : 'Registrar abastecimento'}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            {error && <Alert severity="error" role="alert">{error}</Alert>}
            {fueling && <Alert severity="info">A correção cria uma nova versão. O veículo não pode ser alterado e a versão anterior permanece no histórico.</Alert>}
            <FormSelect label="Veículo" value={values.vehicleId} onChange={(value) => update('vehicleId', value)} options={vehicles} emptyLabel="Selecione um veículo" required disabled={outcomeUncertain || Boolean(fueling)} />
            <FormSelect label="Motorista (opcional)" value={values.driverId} onChange={(value) => update('driverId', value)} options={drivers} emptyLabel="Não informado" disabled={outcomeUncertain} />
            <FormField label="Data e hora (Maceió)" type="datetime-local" value={values.fueledAt} onChange={(value) => update('fueledAt', value)} required disabled={outcomeUncertain} />
            <FormSelect label="Tipo de combustível" value={values.fuelType} onChange={(value) => update('fuelType', value)} options={FUEL_OPTIONS} emptyLabel="Selecione o combustível" required disabled={outcomeUncertain} />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <FormField label="Litros" type="number" value={values.liters} onChange={(value) => update('liters', value)} required inputMode="numeric" disabled={outcomeUncertain} />
              <FormField label="Valor total (R$)" type="number" value={values.totalValue} onChange={(value) => update('totalValue', value)} required inputMode="numeric" disabled={outcomeUncertain} />
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <FormField label="Quilometragem (km)" type="number" value={values.odometerKm} onChange={(value) => update('odometerKm', value)} required inputMode="numeric" disabled={outcomeUncertain} />
              <FormField label="Posto (opcional)" value={values.station} onChange={(value) => update('station', value)} disabled={outcomeUncertain} />
            </Stack>
            <FormField label="Observações" value={values.notes} onChange={(value) => update('notes', value)} multiline minRows={2} disabled={outcomeUncertain} />
            <FormField label="Justificativa do registro" value={values.reason} onChange={(value) => update('reason', value)} required multiline minRows={2} disabled={outcomeUncertain} />
            <FormField label="Descrição da evidência" value={values.evidenceDescription} onChange={(value) => update('evidenceDescription', value)} helperText="Informe o comprovante ou canal em que foi registrado." required multiline minRows={2} disabled={outcomeUncertain} />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2, flexWrap: 'wrap' }}>
          <Button onClick={onCancel} disabled={saving || outcomeUncertain} sx={{ minHeight: 44 }}>Cancelar</Button>
          <Button type="submit" variant="contained" disabled={saving} aria-busy={saving ? 'true' : undefined} sx={{ minHeight: 44 }}>
            {saving ? 'Salvando...' : outcomeUncertain ? 'Tentar novamente' : fueling ? 'Salvar correção' : 'Registrar abastecimento'}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  )
}
