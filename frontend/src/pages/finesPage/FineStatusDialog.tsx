import { useState } from 'react'
import { Stack } from '@mui/material'
import type { ApiRequest } from '../../api/client'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { FormField } from '../../components/ui/FormField'
import StateFeedback from '../../components/ui/StateFeedback'
import { FINE_STATUS_LABELS } from '../../fines/fineTypes'
import type { Fine, FineStatusAction } from '../../fines/fineTypes'
import { changeFineStatus, FineRequestError } from '../../services/finesService'

interface Props {
  api: ApiRequest
  fine: Fine
  status: FineStatusAction
  onSaved: () => void
  onConflict: () => void
  onCancel: () => void
}

/** Confirma a decisão e envia o instante e a evidência exigidos pela API. */
export default function FineStatusDialog({ api, fine, status, onSaved, onConflict, onCancel }: Props) {
  const [values, setValues] = useState({ date: '', reportedBy: '', reason: '', evidenceDescription: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [conflict, setConflict] = useState(false)
  const date = new Date(values.date)
  const complete = Number.isFinite(date.getTime()) && Boolean(values.reportedBy.trim()
    && values.reason.trim() && values.evidenceDescription.trim())
  const statusLabel = FINE_STATUS_LABELS[status]

  async function confirm() {
    if (!complete || saving || conflict) return
    const { reportedBy, reason, evidenceDescription } = values
    const metadata = { reportedBy, reason, evidenceDescription, expectedRevision: fine.revision }
    setSaving(true)
    setError('')
    try {
      await changeFineStatus(api, fine.id, status === 'PAID'
        ? { ...metadata, status, paidAt: date.toISOString() }
        : { ...metadata, status, occurredAt: date.toISOString() })
      onSaved()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível alterar a situação da multa.')
      if (cause instanceof FineRequestError && cause.status === 409) {
        setConflict(true)
        onConflict()
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <ConfirmDialog
      open
      title={status === 'PAID' ? 'Confirmar pagamento' : 'Confirmar recurso'}
      description={`Multa #${fine.id}, veículo ${fine.vehicleSnapshot?.licensePlate ?? fine.vehicle.licensePlate}. Nova situação ${statusLabel.toLowerCase()}.`}
      confirmLabel="Confirmar alteração"
      loading={saving}
      confirmDisabled={!complete || conflict}
      onConfirm={confirm}
      onCancel={onCancel}
      cancelLabel={conflict ? 'Fechar' : 'Cancelar'}
      autoFocusCancel
    >
      <Stack spacing={2} sx={{ mt: 2 }}>
        {error && <StateFeedback kind="error" title={error} />}
        <FormField label={status === 'PAID' ? 'Data e hora do pagamento' : 'Data e hora do recurso'} type="datetime-local" value={values.date} onChange={(date) => setValues({ ...values, date })} required disabled={saving || conflict} />
        <FormField label="Origem da informação" value={values.reportedBy} onChange={(reportedBy) => setValues({ ...values, reportedBy })} required disabled={saving || conflict} />
        <FormField label="Justificativa da alteração" value={values.reason} onChange={(reason) => setValues({ ...values, reason })} required disabled={saving || conflict} />
        <FormField label="Descrição da evidência" value={values.evidenceDescription} onChange={(evidenceDescription) => setValues({ ...values, evidenceDescription })} required disabled={saving || conflict} />
      </Stack>
    </ConfirmDialog>
  )
}
