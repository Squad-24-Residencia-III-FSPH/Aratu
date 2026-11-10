import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack } from '@mui/material'
import type { ApiRequest } from '../../api/client'
import { FormField, FormSelect } from '../../components/ui/FormField'
import type { FormSelectOption } from '../../components/ui/FormField'
import { createFueling } from '../../services/fuelingsService'
import type { CreateFuelingInput } from '../../fuelings/fuelingTypes'

interface FuelingFormDialogProps {
  api: ApiRequest
  reportedBy: string
  vehicles: readonly FormSelectOption[]
  drivers: readonly FormSelectOption[]
  onSaved: () => void
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

function localDateTimeValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export default function FuelingFormDialog({ api, reportedBy, vehicles, drivers, onSaved, onCancel }: FuelingFormDialogProps) {
  const titleId = useId()
  const [values, setValues] = useState({
    vehicleId: '', driverId: '', fueledAt: localDateTimeValue(new Date()), fuelType: '',
    liters: '', totalValue: '', odometerKm: '', station: '', reason: '', evidenceDescription: '',
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function update(field: keyof typeof values, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
    setError('')
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
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
      fueledAt: new Date(values.fueledAt).toISOString(),
      fuelType: values.fuelType as CreateFuelingInput['fuelType'],
      liters: values.liters,
      totalValue: values.totalValue,
      odometerKm,
      ...(values.station.trim() ? { station: values.station.trim() } : {}),
      reportedBy,
      reason: values.reason.trim(),
      evidenceDescription: values.evidenceDescription.trim(),
    }

    setSaving(true)
    setError('')
    try {
      await createFueling(api, input)
      onSaved()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível registrar o abastecimento.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onClose={saving ? undefined : onCancel} fullWidth maxWidth="sm" aria-labelledby={titleId}>
      <Box component="form" onSubmit={handleSubmit} noValidate>
        <DialogTitle id={titleId}>Registrar abastecimento</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            {error && <Alert severity="error" role="alert">{error}</Alert>}
            <FormSelect label="Veículo" value={values.vehicleId} onChange={(value) => update('vehicleId', value)} options={vehicles} emptyLabel="Selecione um veículo" required />
            <FormSelect label="Motorista (opcional)" value={values.driverId} onChange={(value) => update('driverId', value)} options={drivers} emptyLabel="Não informado" />
            <FormField label="Data e hora" type="datetime-local" value={values.fueledAt} onChange={(value) => update('fueledAt', value)} required />
            <FormSelect label="Tipo de combustível" value={values.fuelType} onChange={(value) => update('fuelType', value)} options={FUEL_OPTIONS} emptyLabel="Selecione o combustível" required />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <FormField label="Litros" type="number" value={values.liters} onChange={(value) => update('liters', value)} required inputMode="numeric" />
              <FormField label="Valor total (R$)" type="number" value={values.totalValue} onChange={(value) => update('totalValue', value)} required inputMode="numeric" />
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <FormField label="Quilometragem (km)" type="number" value={values.odometerKm} onChange={(value) => update('odometerKm', value)} required inputMode="numeric" />
              <FormField label="Posto (opcional)" value={values.station} onChange={(value) => update('station', value)} />
            </Stack>
            <FormField label="Justificativa do registro" value={values.reason} onChange={(value) => update('reason', value)} required multiline minRows={2} />
            <FormField label="Descrição da evidência" value={values.evidenceDescription} onChange={(value) => update('evidenceDescription', value)} helperText="Informe o comprovante ou canal em que foi registrado." required multiline minRows={2} />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2, flexWrap: 'wrap' }}>
          <Button onClick={onCancel} disabled={saving} sx={{ minHeight: 44 }}>Cancelar</Button>
          <Button type="submit" variant="contained" disabled={saving} sx={{ minHeight: 44 }}>Registrar abastecimento</Button>
        </DialogActions>
      </Box>
    </Dialog>
  )
}
