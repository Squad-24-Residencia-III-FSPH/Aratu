import { useEffect, useId, useRef } from 'react'
import type { FormEvent } from 'react'
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  Typography,
} from '@mui/material'
import { accessibleControls } from '../../components/ui/accessibleControls'
import { FormField, FormSelect } from '../../components/ui/FormField'
import type { CreateOccurrenceDraft, CreateOccurrenceField } from '../../hooks/useSvoOccurrences'
import { SVO_REQUESTER_TYPE_LABELS, SVO_REQUESTER_TYPES } from '../../types/svoOccurrence'
import type { SvoRequesterType } from '../../types/svoOccurrence'

/** Propriedades do diálogo de registro de nova solicitação SVO (FROTA-109). */
export interface SvoOccurrenceCreateDialogProps {
  /** Rascunho atual do formulário mantido em memória. */
  draft: CreateOccurrenceDraft
  /** Indica envio em andamento para bloquear submissão dupla. */
  submitting: boolean
  /** Indica consulta de reconciliação após falha incerta. */
  reconciling: boolean
  /** Atualiza campos do rascunho em memória. */
  onChange: (patch: Partial<Omit<CreateOccurrenceDraft, 'fieldErrors' | 'error' | 'uncertain'>>) => void
  /** Valida e submete a criação; devolve o primeiro campo inválido para foco. */
  onSubmit: () => Promise<CreateOccurrenceField | null>
  /** Atualiza a lista para conferência quando o resultado do POST é incerto. */
  onReconcile: () => void
  /** Fecha o diálogo preservando o comportamento de cancelamento seguro. */
  onClose: () => void
}

const REQUESTER_OPTIONS = SVO_REQUESTER_TYPES.map((value) => ({
  value,
  label: SVO_REQUESTER_TYPE_LABELS[value],
}))

/**
 * Formulário acessível de registro de solicitação SVO recebida por canal externo.
 *
 * Mantém foco inicial no primeiro campo obrigatório, suporta envio por `Enter`,
 * foca o primeiro campo inválido e bloqueia reenvio cego diante de resultado incerto.
 */
export default function SvoOccurrenceCreateDialog({
  draft,
  submitting,
  reconciling,
  onChange,
  onSubmit,
  onReconcile,
  onClose,
}: SvoOccurrenceCreateDialogProps) {
  const titleId = useId()
  const descId = useId()
  const busy = submitting || reconciling

  const requesterNameRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const requesterPhoneRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const requesterTypeBoxRef = useRef<HTMLDivElement>(null)
  const locationRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const descriptionRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const evidenceRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const notesRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const receivedDateRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const receivedTimeRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      requesterNameRef.current?.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [])

  function focusField(field: CreateOccurrenceField) {
    if (field === 'requesterType') {
      requesterTypeBoxRef.current?.querySelector<HTMLElement>('[role="combobox"]')?.focus()
      return
    }
    const map: Record<Exclude<CreateOccurrenceField, 'requesterType'>, HTMLInputElement | HTMLTextAreaElement | null> = {
      requesterName: requesterNameRef.current,
      requesterPhone: requesterPhoneRef.current,
      location: locationRef.current,
      description: descriptionRef.current,
      evidenceDescription: evidenceRef.current,
      notes: notesRef.current,
      receivedDate: receivedDateRef.current,
      receivedTime: receivedTimeRef.current,
    }
    map[field]?.focus()
  }

  async function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const invalidField = await onSubmit()
    if (invalidField) {
      requestAnimationFrame(() => focusField(invalidField))
    }
  }

  return (
    <Dialog
      open
      onClose={busy ? undefined : onClose}
      fullWidth
      maxWidth="sm"
      aria-labelledby={titleId}
      aria-describedby={descId}
      sx={accessibleControls}
    >
      <DialogTitle id={titleId}>Nova solicitação SVO</DialogTitle>
      <Box component="form" noValidate onSubmit={handleFormSubmit}>
        <DialogContent dividers>
          <Typography id={descId} variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Registre o chamado recebido por canal externo (24h). Os campos obrigatórios de triagem ficam disponíveis para conferência posterior.
          </Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 7 }}>
              <FormField
                label="Nome do solicitante"
                required
                value={draft.requesterName}
                inputRef={requesterNameRef}
                disabled={busy || draft.uncertain}
                error={draft.fieldErrors.requesterName}
                placeholder="Ex.: Solicitante Fictício"
                onChange={(value) => onChange({ requesterName: value })}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 5 }}>
              <FormField
                label="Telefone do solicitante"
                required
                value={draft.requesterPhone}
                inputRef={requesterPhoneRef}
                disabled={busy || draft.uncertain}
                error={draft.fieldErrors.requesterPhone}
                helperText="Informe DDD e número"
                placeholder="Ex.: 79999990000"
                onChange={(value) => onChange({ requesterPhone: value })}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 5 }}>
              <Box ref={requesterTypeBoxRef}>
                <FormSelect
                  label="Tipo de solicitante"
                  required
                  value={draft.requesterType}
                  emptyLabel="Selecione o tipo"
                  displayEmpty
                  disabled={busy || draft.uncertain}
                  error={draft.fieldErrors.requesterType}
                  options={REQUESTER_OPTIONS}
                  onChange={(value) => onChange({ requesterType: value as SvoRequesterType | '' })}
                />
              </Box>
            </Grid>
            <Grid size={{ xs: 12, sm: 7 }}>
              <FormField
                label="Local da remoção"
                required
                value={draft.location}
                inputRef={locationRef}
                disabled={busy || draft.uncertain}
                error={draft.fieldErrors.location}
                placeholder="Ex.: Unidade de Saúde Fictícia"
                onChange={(value) => onChange({ location: value })}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <FormField
                label="Canal ou meio de recebimento (evidência)"
                required
                value={draft.evidenceDescription}
                inputRef={evidenceRef}
                disabled={busy || draft.uncertain}
                error={draft.fieldErrors.evidenceDescription}
                helperText="Informe como o chamado chegou à central (ex.: telefone da central, ofício, rádio)."
                onChange={(value) => onChange({ evidenceDescription: value })}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <FormField
                label="Descrição da solicitação"
                required
                multiline
                minRows={2}
                value={draft.description}
                inputRef={descriptionRef}
                disabled={busy || draft.uncertain}
                error={draft.fieldErrors.description}
                onChange={(value) => onChange({ description: value })}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormField
                label="Data de recebimento"
                type="date"
                value={draft.receivedDate}
                inputRef={receivedDateRef}
                disabled={busy || draft.uncertain}
                error={draft.fieldErrors.receivedDate}
                helperText="Opcional · deixe vazio para usar o horário atual"
                onChange={(value) => onChange({ receivedDate: value })}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormField
                label="Horário de recebimento (Maceió)"
                type="text"
                value={draft.receivedTime}
                inputRef={receivedTimeRef}
                disabled={busy || draft.uncertain}
                error={draft.fieldErrors.receivedTime}
                placeholder="HH:MM"
                maxLength={5}
                helperText="Opcional · formato 24h (ex.: 02:15)"
                onChange={(value) => onChange({ receivedTime: value })}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <FormField
                label="Observações adicionais"
                multiline
                minRows={2}
                value={draft.notes}
                inputRef={notesRef}
                disabled={busy || draft.uncertain}
                helperText="Opcional"
                onChange={(value) => onChange({ notes: value })}
              />
            </Grid>
          </Grid>
          {draft.error && (
            <Alert severity={draft.uncertain ? 'warning' : 'error'} role="alert" sx={{ mt: 2 }}>
              {draft.error}
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, flexWrap: 'wrap', gap: 1 }}>
          <Button type="button" color="inherit" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          {draft.uncertain ? (
            <Button
              type="button"
              variant="contained"
              disabled={busy}
              aria-busy={reconciling ? 'true' : undefined}
              onClick={onReconcile}
            >
              {reconciling ? 'Consultando...' : 'Consultar solicitações'}
            </Button>
          ) : (
            <Button
              type="submit"
              variant="contained"
              disabled={busy}
              aria-busy={submitting ? 'true' : undefined}
            >
              {submitting ? 'Registrando...' : 'Registrar solicitação'}
            </Button>
          )}
        </DialogActions>
      </Box>
    </Dialog>
  )
}
