import { useEffect, useId, useState } from 'react'
import type { FormEvent } from 'react'
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack } from '@mui/material'
import type { ApiRequest } from '../../api/client'
import { FormField, FormSelect } from '../../components/ui/FormField'
import type { FormSelectOption } from '../../components/ui/FormField'
import StateFeedback from '../../components/ui/StateFeedback'
import type { CreateFineInput, FineDriverSuggestion } from '../../fines/fineTypes'
import { createFine, FineRequestError, suggestFineDrivers } from '../../services/finesService'

interface Props {
  api: ApiRequest
  vehicles: FormSelectOption[]
  drivers: FormSelectOption[]
  onSaved: () => void
  onCancel: (refreshHistory: boolean) => void
}

const initialValues = {
  vehicleId: '', driverId: '', infractionAt: '', infractionCode: '', description: '',
  amount: '', dueAt: '', reportedBy: '', reason: '', evidenceDescription: '',
}

const localDateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

/** Permite identificar o motorista manualmente ou confirmar uma viagem sugerida pela API. */
export default function FineFormDialog({ api, vehicles, drivers, onSaved, onCancel }: Props) {
  const titleId = useId()
  const [values, setValues] = useState(initialValues)
  const [tripId, setTripId] = useState('')
  const [suggestions, setSuggestions] = useState<FineDriverSuggestion[]>([])
  const [suggestionError, setSuggestionError] = useState('')
  const [suggesting, setSuggesting] = useState(false)
  const [suggestionRetry, setSuggestionRetry] = useState(0)
  const [error, setError] = useState('')
  const [amountError, setAmountError] = useState('')
  const [saving, setSaving] = useState(false)
  const [pending, setPending] = useState<{ key: string; input: CreateFineInput } | null>(null)
  const [uncertain, setUncertain] = useState(false)
  const { vehicleId, infractionAt } = values
  const fieldsDisabled = saving || uncertain

  useEffect(() => {
    const instant = new Date(infractionAt)
    if (!vehicleId || !Number.isFinite(instant.getTime())) return
    const controller = new AbortController()
    suggestFineDrivers(api, vehicleId, instant.toISOString(), controller.signal)
      .then((items) => { if (!controller.signal.aborted) setSuggestions(items) })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setSuggestionError(cause instanceof Error ? cause.message : 'Falha ao consultar sugestões.')
      })
      .finally(() => { if (!controller.signal.aborted) setSuggesting(false) })
    return () => controller.abort()
  }, [api, vehicleId, infractionAt, suggestionRetry])

  function update(field: keyof typeof values, value: string) {
    const contextChanged = field === 'vehicleId' || field === 'infractionAt'
    const next = { ...values, [field]: value }
    if (contextChanged) {
      next.driverId = ''
      setSuggestions([])
      setSuggestionError('')
      setSuggesting(Boolean(next.vehicleId && Number.isFinite(new Date(next.infractionAt).getTime())))
    }
    if (contextChanged || field === 'driverId') setTripId('')
    setValues(next)
    setError('')
    if (field === 'amount') setAmountError('')
  }

  function buildInput(): CreateFineInput | null {
    const amount = /^(0|[1-9]\d{0,9})(?:[,.](\d{1,2}))?$/.exec(values.amount.trim())
    if (!amount) {
      setAmountError('Informe um valor de 0 a 9999999999,99, com até duas casas decimais.')
      return null
    }
    const instant = new Date(infractionAt)
    if (!vehicleId || !Number.isFinite(instant.getTime()) || !values.infractionCode.trim()
      || !values.description.trim() || !values.reportedBy.trim() || !values.reason.trim()
      || !values.evidenceDescription.trim()) {
      setError('Preencha o veículo, a data e hora, o código, a descrição, a origem, a justificativa e a evidência.')
      return null
    }
    return {
      ...values,
      driverId: values.driverId || null,
      tripId: tripId || null,
      infractionAt: instant.toISOString(),
      amount: `${amount[1]}.${(amount[2] ?? '').padEnd(2, '0')}`,
      dueAt: values.dueAt || null,
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    const input = pending?.input ?? buildInput()
    if (!input) return
    const attempt = pending ?? { input, key: crypto.randomUUID() }
    setSaving(true)
    setError('')
    try {
      await createFine(api, attempt.input, attempt.key)
      onSaved()
    } catch (cause) {
      const mayHaveSaved = !(cause instanceof FineRequestError) || cause.status >= 500
      setPending(mayHaveSaved ? attempt : null)
      setUncertain(mayHaveSaved)
      setError(cause instanceof Error ? cause.message : 'Não foi possível registrar a multa.')
    } finally {
      setSaving(false)
    }
  }

  const suggestionOptions = suggestions.map((item) => ({
    value: item.tripId,
    label: `${item.driverName} — viagem #${item.tripId} (início ${localDateTime.format(new Date(item.startedAt))})`,
  }))
  const selectedSuggestion = suggestions.find((item) => item.tripId === tripId)
  const driverOptions = selectedSuggestion && !drivers.some((driver) => driver.value === selectedSuggestion.driverId)
    ? [...drivers, { value: selectedSuggestion.driverId, label: selectedSuggestion.driverName }]
    : drivers

  return (
    <Dialog open onClose={saving ? undefined : () => onCancel(uncertain)} fullWidth maxWidth="sm" aria-labelledby={titleId}>
      <Box component="form" onSubmit={submit}>
        <DialogTitle id={titleId}>Registrar multa</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            {error && <StateFeedback kind="error" title={error} description={uncertain ? 'Tente novamente para confirmar o mesmo registro sem duplicar a multa.' : undefined} />}
            <FormSelect label="Veículo" value={vehicleId} onChange={(value) => update('vehicleId', value)} options={vehicles} emptyLabel="Selecione um veículo" required disabled={fieldsDisabled} />
            <FormField label="Data e hora da infração" type="datetime-local" value={infractionAt} onChange={(value) => update('infractionAt', value)} required disabled={fieldsDisabled} />
            {suggesting && <StateFeedback kind="loading" title="Consultando sugestões de motorista..." />}
            {suggestionError && <StateFeedback kind="partial" title="Consulta de sugestões indisponível" description={suggestionError} actionLabel={fieldsDisabled ? undefined : 'Tentar novamente'} onAction={() => {
              setSuggestionError('')
              setSuggesting(true)
              setSuggestionRetry((value) => value + 1)
            }} />}
            {suggestions.length > 0 && <FormSelect label="Motorista sugerido pela viagem" options={suggestionOptions} value={tripId} emptyLabel="Sem viagem vinculada" displayEmpty disabled={fieldsDisabled} onChange={(value) => {
              const suggestion = suggestions.find((item) => item.tripId === value)
              update('driverId', suggestion?.driverId ?? '')
              setTripId(value)
            }} />}
            <FormSelect label="Motorista (opcional)" value={values.driverId} onChange={(value) => update('driverId', value)} options={driverOptions} emptyLabel="Sem motorista associado" displayEmpty disabled={fieldsDisabled} />
            <FormField label="Código da infração" value={values.infractionCode} onChange={(value) => update('infractionCode', value)} required disabled={fieldsDisabled} />
            <FormField label="Descrição da infração" value={values.description} onChange={(value) => update('description', value)} multiline required disabled={fieldsDisabled} />
            <FormField label="Valor (R$)" value={values.amount} onChange={(value) => update('amount', value)} helperText="Exemplo 150,75" error={amountError} required disabled={fieldsDisabled} />
            <FormField label="Vencimento (opcional)" type="date" value={values.dueAt} onChange={(value) => update('dueAt', value)} disabled={fieldsDisabled} />
            <FormField label="Origem da informação" value={values.reportedBy} onChange={(value) => update('reportedBy', value)} required disabled={fieldsDisabled} />
            <FormField label="Justificativa do registro" value={values.reason} onChange={(value) => update('reason', value)} required disabled={fieldsDisabled} />
            <FormField label="Descrição da evidência" value={values.evidenceDescription} onChange={(value) => update('evidenceDescription', value)} required disabled={fieldsDisabled} />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => onCancel(uncertain)} color="inherit" disabled={saving} sx={{ minHeight: 44 }}>{uncertain ? 'Fechar e atualizar histórico' : 'Cancelar'}</Button>
          <Button type="submit" variant="contained" disabled={saving} aria-busy={saving} sx={{ minHeight: 44 }}>
            {saving ? 'Registrando...' : uncertain ? 'Tentar novamente' : 'Registrar multa'}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  )
}
