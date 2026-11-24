import { useRef, useState } from 'react'
import { Alert, Button, Stack, Typography } from '@mui/material'
import type { ApiRequest } from '../../api/client.ts'
import { accessibleControls } from '../../components/ui/accessibleControls.ts'
import ConfirmDialog from '../../components/ui/ConfirmDialog.tsx'
import { FormField } from '../../components/ui/FormField.tsx'
import {
  annulVehicleDocument,
  VehicleDocumentRequestError,
} from '../../services/vehicleDocumentsService.ts'
import { VEHICLE_DOCUMENT_TYPE_LABELS } from '../../types/vehicleDocument.ts'
import type { VehicleDocument } from '../../types/vehicleDocument.ts'
import { formatCalendarDate } from '../../utils/dates.ts'

export interface VehicleDocumentAnnulDialogProps {
  api: ApiRequest
  document: VehicleDocument
  onAnnulled: (annulled: VehicleDocument) => void
  onCancel: () => void
  onConflictReload: (documentId: string) => void
}

/** Confirma a anulação justificada preservando o documento no histórico. */
export default function VehicleDocumentAnnulDialog({
  api,
  document,
  onAnnulled,
  onCancel,
  onConflictReload,
}: VehicleDocumentAnnulDialogProps) {
  const [reportedBy, setReportedBy] = useState('')
  const [reason, setReason] = useState('')
  const [reportedByError, setReportedByError] = useState<string>()
  const [reasonError, setReasonError] = useState<string>()
  const [submitError, setSubmitError] = useState('')
  const [conflict, setConflict] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)
  const reportedByRef = useRef<HTMLInputElement>(null)
  const reasonRef = useRef<HTMLTextAreaElement>(null)

  async function handleConfirm() {
    if (submittingRef.current || conflict) return

    const nextReportedByError = reportedBy.trim() ? undefined : 'Informe a origem da informação.'
    const nextReasonError = reason.trim() ? undefined : 'Informe a justificativa da anulação.'
    setReportedByError(nextReportedByError)
    setReasonError(nextReasonError)

    if (nextReportedByError) {
      reportedByRef.current?.focus()
      return
    }
    if (nextReasonError) {
      reasonRef.current?.focus()
      return
    }

    submittingRef.current = true
    setSubmitting(true)
    setSubmitError('')

    try {
      const annulled = await annulVehicleDocument(api, document.id, {
        expectedRevision: document.revision,
        reportedBy: reportedBy.trim(),
        reason: reason.trim(),
      })
      onAnnulled(annulled)
    } catch (failure: unknown) {
      if (failure instanceof VehicleDocumentRequestError) {
        if (failure.kind === 'conflict') {
          setConflict(true)
          setSubmitError(failure.message)
          return
        }
        if (failure.kind === 'forbidden') {
          setSubmitError('Seu perfil não tem permissão para anular documentos de veículos.')
          return
        }
        setSubmitError(failure.message)
        return
      }
      setSubmitError('Não foi possível anular o documento. Tente novamente.')
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  return (
    <ConfirmDialog
      open
      danger
      title={`Anular documento #${document.id}?`}
      description={(
        <Stack spacing={1}>
          <Typography variant="body2">
            {VEHICLE_DOCUMENT_TYPE_LABELS[document.documentType]} do veículo{' '}
            <strong>{document.vehicle.licensePlate}</strong> com vencimento em{' '}
            {formatCalendarDate(document.expiresAt)} (revisão {document.revision}).
          </Typography>
          <Typography variant="body2">
            O registro permanecerá visível no histórico e não poderá mais ser editado ou renovado.
          </Typography>
          {document.supersedesId !== null && (
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Atenção: este documento renova o documento #{document.supersedesId}. Ao anulá-lo, o
              documento anterior voltará automaticamente a ficar vigente.
            </Typography>
          )}
        </Stack>
      )}
      confirmLabel="Confirmar anulação"
      cancelLabel="Manter documento"
      loadingLabel="Anulando..."
      onConfirm={() => { void handleConfirm() }}
      onCancel={onCancel}
      loading={submitting}
      confirmDisabled={conflict}
      onEntered={() => reportedByRef.current?.focus()}
      sx={accessibleControls}
    >
      <Stack spacing={2} sx={{ mt: 2 }}>
        {submitError && (
          <Alert
            severity="error"
            role="alert"
            action={conflict
              ? (
                  <Button
                    color="inherit"
                    size="small"
                    onClick={() => onConflictReload(document.id)}
                    sx={{ minHeight: 44 }}
                  >
                    Atualizar dados
                  </Button>
                )
              : undefined}
          >
            {submitError}
          </Alert>
        )}

        <FormField
          label="Origem da informação"
          value={reportedBy}
          onChange={(value) => {
            setReportedBy(value)
            setReportedByError(undefined)
          }}
          inputRef={reportedByRef}
          error={reportedByError}
          disabled={submitting || conflict}
          required
          helperText="Identifique quem solicitou ou comunicou a anulação."
        />

        <FormField
          label="Justificativa da anulação"
          value={reason}
          onChange={(value) => {
            setReason(value)
            setReasonError(undefined)
          }}
          inputRef={reasonRef}
          error={reasonError}
          disabled={submitting || conflict}
          required
          multiline
          minRows={2}
          helperText="Registrada de forma permanente na linha do tempo e na auditoria."
        />
      </Stack>
    </ConfirmDialog>
  )
}
