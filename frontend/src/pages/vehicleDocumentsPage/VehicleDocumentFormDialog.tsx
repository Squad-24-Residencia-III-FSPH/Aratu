import { useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
} from '@mui/material'
import type { ApiRequest } from '../../api/client.ts'
import { accessibleControls } from '../../components/ui/accessibleControls.ts'
import { FormField, FormSelect } from '../../components/ui/FormField.tsx'
import {
  createVehicleDocument,
  updateVehicleDocument,
  VehicleDocumentRequestError,
} from '../../services/vehicleDocumentsService.ts'
import {
  VEHICLE_DOCUMENT_TYPE_LABELS,
  VEHICLE_DOCUMENT_TYPES,
} from '../../types/vehicleDocument.ts'
import type {
  VehicleDocument,
  VehicleDocumentType,
} from '../../types/vehicleDocument.ts'
import { formatCalendarDate } from '../../utils/dates.ts'
import type { Vehicle } from '../../vehicles/vehicleTypes.ts'
import {
  documentToEditValues,
  documentToRenewalValues,
  EMPTY_DOCUMENT_FORM,
  validateDocumentForm,
} from './vehicleDocumentForm.ts'
import type { DocumentFormErrors, DocumentFormValues } from './vehicleDocumentForm.ts'

export type DocumentFormMode = 'create' | 'renew' | 'edit'

export interface VehicleDocumentFormDialogProps {
  api: ApiRequest
  mode: DocumentFormMode
  document?: VehicleDocument
  vehicles: readonly Vehicle[]
  referenceDate?: string
  onSaved: (saved: VehicleDocument, mode: DocumentFormMode) => void
  onCancel: () => void
  onConflictReload?: (documentId: string) => void
}

const DOCUMENT_TYPE_OPTIONS = VEHICLE_DOCUMENT_TYPES.map((value) => ({
  value,
  label: VEHICLE_DOCUMENT_TYPE_LABELS[value],
}))

function formatVehicleOptionLabel(vehicle: Vehicle): string {
  const model = vehicle.model ? ` — ${vehicle.model}` : ''
  const inactiveSuffix = vehicle.status === 'INACTIVE' ? ' (Inativo)' : ''
  return `${vehicle.licensePlate}${model}${inactiveSuffix}`
}

/** Formulário acessível para cadastro, renovação encadeada e correção de documentos. */
export default function VehicleDocumentFormDialog({
  api,
  mode,
  document,
  vehicles,
  referenceDate,
  onSaved,
  onCancel,
  onConflictReload,
}: VehicleDocumentFormDialogProps) {
  const titleId = useId()
  const initialValues: DocumentFormValues = mode === 'edit' && document
    ? documentToEditValues(document)
    : mode === 'renew' && document
      ? documentToRenewalValues(document)
      : EMPTY_DOCUMENT_FORM

  const [values, setValues] = useState<DocumentFormValues>(initialValues)
  const [errors, setErrors] = useState<DocumentFormErrors>({})
  const [submitError, setSubmitError] = useState('')
  const [conflict, setConflict] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)

  const documentNumberRef = useRef<HTMLInputElement>(null)
  const issuedAtRef = useRef<HTMLInputElement>(null)
  const expiresAtRef = useRef<HTMLInputElement>(null)
  const notesRef = useRef<HTMLTextAreaElement>(null)
  const reportedByRef = useRef<HTMLInputElement>(null)
  const reasonRef = useRef<HTMLTextAreaElement>(null)

  const vehicleOptions = vehicles.map((vehicle) => ({
    value: vehicle.id,
    label: formatVehicleOptionLabel(vehicle),
  }))

  if (document && !vehicleOptions.some((option) => option.value === document.vehicleId)) {
    const fallbackModel = document.vehicle.model ? ` — ${document.vehicle.model}` : ''
    vehicleOptions.unshift({
      value: document.vehicleId,
      label: `${document.vehicle.licensePlate}${fallbackModel}`,
    })
  }

  function updateField<K extends keyof DocumentFormValues>(field: K, value: DocumentFormValues[K]) {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => {
      if (!current[field]) return current
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  function focusFirstInvalid(nextErrors: DocumentFormErrors) {
    if (nextErrors.issuedAt) issuedAtRef.current?.focus()
    else if (nextErrors.expiresAt) expiresAtRef.current?.focus()
    else if (nextErrors.notes) notesRef.current?.focus()
    else if (nextErrors.reportedBy) reportedByRef.current?.focus()
    else if (nextErrors.reason) reasonRef.current?.focus()
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submittingRef.current || conflict) return

    const nextErrors = validateDocumentForm(values, mode, referenceDate)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      setSubmitError('Corrija os campos indicados antes de salvar.')
      focusFirstInvalid(nextErrors)
      return
    }

    submittingRef.current = true
    setSubmitting(true)
    setSubmitError('')

    const documentNumber = values.documentNumber.trim() || null
    const issuedAt = values.issuedAt.trim() || null
    const expiresAt = values.expiresAt.trim()
    const notes = values.notes.trim() || null
    const reportedBy = values.reportedBy.trim()
    const reason = values.reason.trim()

    try {
      let saved: VehicleDocument
      if (mode === 'edit' && document) {
        saved = await updateVehicleDocument(api, document.id, {
          expectedRevision: document.revision,
          documentNumber,
          issuedAt,
          expiresAt,
          notes,
          reportedBy,
          reason,
        })
      } else {
        saved = await createVehicleDocument(api, {
          vehicleId: values.vehicleId,
          documentType: values.documentType as VehicleDocumentType,
          documentNumber,
          issuedAt,
          expiresAt,
          notes,
          ...(mode === 'renew' && document ? { supersedesId: document.id } : {}),
          reportedBy,
          reason,
        })
      }
      onSaved(saved, mode)
    } catch (failure: unknown) {
      if (failure instanceof VehicleDocumentRequestError) {
        if (failure.kind === 'conflict') {
          if (mode === 'edit' || mode === 'renew') {
            setConflict(true)
          }
          setSubmitError(failure.message)
          return
        }
        if (failure.kind === 'forbidden') {
          setSubmitError('Seu perfil não tem permissão para salvar documentos de veículos.')
          return
        }
        setSubmitError(failure.message)
        return
      }
      setSubmitError('Não foi possível salvar o documento. Tente novamente.')
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  const title = mode === 'edit' && document
    ? `Corrigir documento #${document.id}`
    : mode === 'renew' && document
      ? `Renovar documento #${document.id}`
      : 'Cadastrar documento'

  const immutableContext = mode !== 'create'
  const referenceNote = referenceDate
    ? `Data de referência FSPH: ${formatCalendarDate(referenceDate)}.`
    : undefined

  return (
    <Dialog
      open
      onClose={submitting ? undefined : onCancel}
      aria-labelledby={titleId}
      fullWidth
      maxWidth="md"
      sx={accessibleControls}
    >
      <Box component="form" onSubmit={handleSubmit} aria-busy={submitting ? 'true' : undefined} noValidate>
        <DialogTitle id={titleId}>{title}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            {mode === 'renew' && document && (
              <Alert severity="info">
                Renovação do documento #{document.id} ({VEHICLE_DOCUMENT_TYPE_LABELS[document.documentType]} ·{' '}
                {document.vehicle.licensePlate} · vencimento em {formatCalendarDate(document.expiresAt)}).
                Ao salvar, o documento anterior passará para a situação Renovado e sairá dos alertas.
              </Alert>
            )}

            {submitError && (
              <Alert
                severity="error"
                role="alert"
                action={conflict && document && onConflictReload
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

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <FormSelect
                label="Veículo"
                value={values.vehicleId}
                onChange={(value) => updateField('vehicleId', value)}
                options={vehicleOptions}
                emptyLabel="Selecione o veículo"
                error={errors.vehicleId}
                helperText={mode === 'edit'
                  ? 'Veículo e tipo são imutáveis após o cadastro.'
                  : undefined}
                disabled={submitting || immutableContext}
                required
                autoFocus={mode === 'create'}
              />
              <FormSelect
                label="Tipo de documento"
                value={values.documentType}
                onChange={(value) => updateField('documentType', value as VehicleDocumentType | '')}
                options={DOCUMENT_TYPE_OPTIONS}
                emptyLabel="Selecione o tipo"
                error={errors.documentType}
                disabled={submitting || immutableContext}
                required
              />
            </Stack>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <FormField
                label="Número do documento"
                value={values.documentNumber}
                onChange={(value) => updateField('documentNumber', value)}
                inputRef={documentNumberRef}
                disabled={submitting || conflict}
                helperText="Opcional. Ex.: número do CRLV, apólice ou contrato."
                autoFocus={immutableContext}
              />
              <FormField
                label="Data de emissão"
                type="date"
                value={values.issuedAt}
                onChange={(value) => updateField('issuedAt', value)}
                inputRef={issuedAtRef}
                error={errors.issuedAt}
                disabled={submitting || conflict}
                helperText={referenceNote
                  ? `Opcional. Não pode ser futura. ${referenceNote}`
                  : 'Opcional. Não pode ser futura.'}
              />
              <FormField
                label="Data de vencimento"
                type="date"
                value={values.expiresAt}
                onChange={(value) => updateField('expiresAt', value)}
                inputRef={expiresAtRef}
                error={errors.expiresAt}
                disabled={submitting || conflict}
                required
                helperText="Obrigatório. Documentos vencidos podem ser registrados para controle histórico."
              />
            </Stack>

            <FormField
              label="Observações"
              value={values.notes}
              onChange={(value) => updateField('notes', value)}
              inputRef={notesRef}
              error={errors.notes}
              disabled={submitting || conflict}
              required={values.documentType === 'OTHER'}
              multiline
              minRows={2}
              helperText={values.documentType === 'OTHER'
                ? 'Obrigatório descrever o documento quando o tipo for Outro.'
                : 'Opcional.'}
            />

            <FormField
              label="Origem da informação"
              value={values.reportedBy}
              onChange={(value) => updateField('reportedBy', value)}
              inputRef={reportedByRef}
              error={errors.reportedBy}
              disabled={submitting || conflict}
              required
              helperText="Identifique quem informou e o canal ou documento de origem."
            />

            <FormField
              label="Justificativa"
              value={values.reason}
              onChange={(value) => updateField('reason', value)}
              inputRef={reasonRef}
              error={errors.reason}
              disabled={submitting || conflict}
              required
              multiline
              minRows={2}
              helperText="Registrada na linha do tempo do documento e na auditoria."
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2, flexWrap: 'wrap', gap: 1 }}>
          <Button onClick={onCancel} disabled={submitting} color="inherit" sx={{ minHeight: 44 }}>
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={submitting || conflict}
            aria-busy={submitting ? 'true' : undefined}
            sx={{ minHeight: 44 }}
          >
            {submitting
              ? 'Salvando...'
              : mode === 'edit'
                ? 'Salvar correção'
                : mode === 'renew'
                  ? 'Registrar renovação'
                  : 'Cadastrar documento'}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  )
}
