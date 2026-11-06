import { useState } from 'react'
import { Alert } from '@mui/material'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { FormField } from '../../components/ui/FormField'
import type { ApiRequest } from '../../api/client'
import { DriverRequestError } from '../../drivers/driverTypes'
import type { Driver } from '../../drivers/driverTypes'
import { changeDriverStatus } from '../../services/driversService'

interface DriverStatusDialogProps {
  api: ApiRequest
  driver: Driver
  reportedBy: string
  onSaved: (driver: Driver) => void
  onCancel: () => void
}

/** Confirma a ativação ou inativação pedida e registra a justificativa na auditoria. */
export default function DriverStatusDialog({ api, driver, reportedBy, onSaved, onCancel }: DriverStatusDialogProps) {
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [saving, setSaving] = useState(false)
  const activating = driver.status !== 'ACTIVE'

  async function confirmStatus() {
    if (!reason.trim()) {
      setReasonError('Informe a justificativa da mudança de situação.')
      return
    }
    setSaving(true)
    setSubmitError('')
    try {
      const saved = await changeDriverStatus(api, driver.id, {
        status: activating ? 'ACTIVE' : 'INACTIVE',
        expectedRevision: driver.revision,
        reportedBy,
        reason: reason.trim(),
      })
      onSaved(saved)
    } catch (error) {
      setSubmitError(error instanceof DriverRequestError || error instanceof Error
        ? error.message
        : 'Não foi possível alterar a situação do motorista.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ConfirmDialog
      open
      title={activating ? 'Reativar motorista' : 'Inativar motorista'}
      description={activating
        ? `O motorista ${driver.name} voltará à situação ativa. A CNH precisa estar válida.`
        : `O acesso operacional de ${driver.name} será inativado. O histórico será preservado.`}
      confirmLabel={activating ? 'Reativar' : 'Inativar'}
      onConfirm={confirmStatus}
      onCancel={onCancel}
      loading={saving}
      danger={!activating}
      paperSx={{ borderRadius: 2 }}
    >
      {submitError && <Alert severity="error" role="alert" sx={{ mt: 2 }}>{submitError}</Alert>}
      <FormField
        label="Justificativa"
        value={reason}
        onChange={(value) => {
          setReason(value)
          setReasonError('')
        }}
        error={reasonError}
        helperText="Registrada no histórico do motorista e na auditoria."
        required
        multiline
        minRows={2}
      />
    </ConfirmDialog>
  )
}
