import { useRef, useState } from 'react'
import { Alert, Button, Stack, Typography } from '@mui/material'
import type { ApiRequest } from '../../api/client.ts'
import ConfirmDialog from '../../components/ui/ConfirmDialog.tsx'
import { FormField } from '../../components/ui/FormField.tsx'
import { accessibleControls } from '../../components/ui/accessibleControls.ts'
import { changeFineStatus, FineRequestError } from '../../services/finesService.ts'
import {
  FINE_STATUS_LABELS,
  FINE_TRANSITION_ACTION_LABELS,
  getAttachmentUrlError,
  isValidLocalDateTime,
  localDateTimeToIso,
  toLocalDateTimeInput,
} from '../../types/fine.ts'
import type { ChangeFineStatusInput, Fine, FineStatus } from '../../types/fine.ts'

interface FineStatusDialogProps {
  api: ApiRequest
  fine: Fine
  targetStatus: FineStatus
  onSaved: (fine: Fine) => void
  onCancel: () => void
  onConflict: () => void
}

/** Confirma transição de situação com revisão otimista, data de pagamento quando aplicável e justificativa. */
export default function FineStatusDialog({
  api,
  fine,
  targetStatus,
  onSaved,
  onCancel,
  onConflict,
}: FineStatusDialogProps) {
  const [paidAtInput, setPaidAtInput] = useState(() => (
    targetStatus === 'PAID' ? toLocalDateTimeInput(new Date().toISOString()) : ''
  ))
  const [reportedBy, setReportedBy] = useState('')
  const [reason, setReason] = useState('')
  const [evidenceDescription, setEvidenceDescription] = useState('')
  const [attachmentUrl, setAttachmentUrl] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [conflict, setConflict] = useState(false)
  const [saving, setSaving] = useState(false)
  const submittingRef = useRef(false)

  const isPayment = targetStatus === 'PAID'
  const isCancellation = targetStatus === 'CANCELED'
  const isReopen = targetStatus === 'PENDING'

  const paidAtError = isPayment
    ? !paidAtInput
      ? 'Informe a data e hora do pagamento.'
      : !isValidLocalDateTime(paidAtInput)
        ? 'Informe data e hora válidas para o pagamento.'
        : undefined
    : undefined
  const attachmentUrlError = getAttachmentUrlError(attachmentUrl)

  async function handleConfirm() {
    if (submittingRef.current || conflict) return
    setSubmitted(true)

    if (
      paidAtError
      || !reportedBy.trim()
      || !reason.trim()
      || !evidenceDescription.trim()
      || attachmentUrlError
    ) {
      setSubmitError('Preencha os campos obrigatórios antes de confirmar a mudança de situação.')
      return
    }

    const baseMetadata = {
      expectedRevision: fine.revision,
      reportedBy: reportedBy.trim(),
      reason: reason.trim(),
      evidenceDescription: evidenceDescription.trim(),
      attachmentUrl: attachmentUrl.trim() || null,
    }

    const input: ChangeFineStatusInput = isPayment
      ? {
          ...baseMetadata,
          status: 'PAID',
          paidAt: localDateTimeToIso(paidAtInput),
        }
      : {
          ...baseMetadata,
          status: targetStatus,
          occurredAt: new Date().toISOString(),
        }

    submittingRef.current = true
    setSaving(true)
    setSubmitError('')
    try {
      const updated = await changeFineStatus(api, fine.id, input)
      onSaved(updated)
    } catch (failure) {
      setSubmitError(
        failure instanceof Error
          ? failure.message
          : 'Não foi possível alterar a situação da multa.',
      )
      if (failure instanceof FineRequestError && failure.status === 409) {
        setConflict(true)
      }
    } finally {
      submittingRef.current = false
      setSaving(false)
    }
  }

  return (
    <ConfirmDialog
      open
      sx={accessibleControls}
      title={`${FINE_TRANSITION_ACTION_LABELS[targetStatus]} #${fine.id}?`}
      description={
        <Stack spacing={1}>
          <Typography variant="body2">
            Multa <strong>{fine.infractionCode}</strong> — veículo <strong>{fine.vehicle.licensePlate}</strong>.
            A situação será alterada de <strong>{FINE_STATUS_LABELS[fine.status]}</strong> para{' '}
            <strong>{FINE_STATUS_LABELS[targetStatus]}</strong>.
          </Typography>
          {isReopen && (
            <Typography variant="body2" color="text.secondary">
              A reabertura retorna a multa para Pendente e limpa o estado ativo de pagamento ou cancelamento, mantendo o registro anterior preservado na trilha de eventos.
            </Typography>
          )}
          {isCancellation && (
            <Typography variant="body2" color="text.secondary">
              A multa não é excluída do sistema; o cancelamento e a justificativa permanecem registrados no histórico.
            </Typography>
          )}
        </Stack>
      }
      cancelLabel="Voltar"
      confirmLabel={FINE_TRANSITION_ACTION_LABELS[targetStatus]}
      confirmDisabled={conflict}
      danger={isCancellation}
      onCancel={onCancel}
      onConfirm={() => void handleConfirm()}
      loading={saving}
      paperSx={{ borderRadius: 2 }}
    >
      <Stack spacing={2} sx={{ mt: 2 }}>
        {submitError && (
          <Alert
            severity="error"
            role="alert"
            action={conflict ? <Button color="inherit" onClick={onConflict}>Recarregar multa</Button> : undefined}
          >
            {submitError}
          </Alert>
        )}

        {isPayment && (
          <FormField
            label="Data e hora do pagamento"
            type="datetime-local"
            value={paidAtInput}
            onChange={setPaidAtInput}
            required
            disabled={saving}
            error={submitted ? paidAtError : undefined}
            helperText="Horário local deste dispositivo; enviado em UTC para a API."
          />
        )}

        <FormField
          label="Origem da informação"
          value={reportedBy}
          onChange={setReportedBy}
          required
          disabled={saving}
          error={submitted && !reportedBy.trim() ? 'Informe a origem da informação.' : undefined}
          helperText="Ex.: Comprovante bancário, setor jurídico ou protocolo."
        />

        <FormField
          label="Justificativa"
          value={reason}
          onChange={setReason}
          required
          multiline
          minRows={2}
          disabled={saving}
          error={submitted && !reason.trim() ? 'Informe a justificativa.' : undefined}
        />

        <FormField
          label="Descrição da evidência"
          value={evidenceDescription}
          onChange={setEvidenceDescription}
          required
          multiline
          minRows={2}
          disabled={saving}
          error={submitted && !evidenceDescription.trim() ? 'Informe a descrição da evidência.' : undefined}
        />

        <FormField
          label="URL da evidência (opcional)"
          value={attachmentUrl}
          onChange={setAttachmentUrl}
          disabled={saving}
          error={submitted ? attachmentUrlError : undefined}
        />
      </Stack>
    </ConfirmDialog>
  )
}
