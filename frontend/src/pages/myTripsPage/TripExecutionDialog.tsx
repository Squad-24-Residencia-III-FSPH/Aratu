import { useEffect, useRef } from 'react'
import { Alert, Box, Button } from '@mui/material'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { FormField } from '../../components/ui/FormField'
import type { ExecutionDraft } from '../../hooks/useMyTrips'
import { ACTION_LABELS, formatKm } from '../../trips/tripPresentation'
import type { DriverTrip, TripExecutionAction } from '../../trips/tripTypes'

const ACTION_TEXTS: Readonly<Record<TripExecutionAction, {
  fieldLabel: string
  confirmLabel: string
  consequence: string
}>> = {
  START: {
    fieldLabel: 'Quilometragem inicial (km)',
    confirmLabel: 'Confirmar início',
    consequence: 'Ao confirmar, o início da viagem é registrado com a quilometragem informada. O registro fica no histórico e não pode ser editado nesta tela.',
  },
  FINISH: {
    fieldLabel: 'Quilometragem final (km)',
    confirmLabel: 'Confirmar término',
    consequence: 'Ao confirmar, o término da viagem é registrado com a quilometragem informada e a viagem sai da lista de pendentes. O registro fica no histórico e não pode ser editado nesta tela.',
  },
}

export interface TripExecutionDialogProps {
  /** Rascunho em memória: ação, km digitado e erros; preservado enquanto o diálogo estiver aberto. */
  draft: ExecutionDraft
  /** Viagem alvo segundo a última consulta; `null` quando ela deixou a lista de pendentes. */
  trip: DriverTrip | null
  /** Motivo pelo qual a ação deixou de ser compatível com a situação atual (vazio quando válida). */
  issue: string
  submitting: boolean
  /** Uma consulta está em andamento. */
  refreshing: boolean
  onKmChange: (value: string) => void
  onConfirm: () => void
  onCancel: () => void
  onRefresh: () => void
}

/**
 * Diálogo único de início/término: identifica a viagem, recebe o km e confirma sem passos repetidos.
 *
 * Acessibilidade: foco inicial no campo, `Esc` fecha fora do envio (herdado de `ConfirmDialog`),
 * o foco volta ao acionador ao fechar, erro do campo com `role="alert"` e `aria-invalid`.
 * `Enter` no campo confirma, como o botão principal.
 */
export default function TripExecutionDialog({
  draft, trip, issue, submitting, refreshing, onKmChange, onConfirm, onCancel, onRefresh,
}: TripExecutionDialogProps) {
  const kmRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (draft.fieldError) kmRef.current?.focus()
  }, [draft.fieldError])

  function confirmExecution() {
    // Há um único campo: também o mantém focado quando a mesma entrada inválida é reenviada.
    kmRef.current?.focus()
    onConfirm()
  }

  const texts = ACTION_TEXTS[draft.action]
  const identification = trip
    ? `Viagem #${trip.id} para ${trip.destination} (origem: ${trip.origin}), veículo ${trip.vehicleLicensePlate}.`
    : `Viagem #${draft.tripId}.`
  const startKmHint = draft.action === 'FINISH' && trip && trip.startKm !== null
    ? `Quilometragem inicial registrada: ${formatKm(trip.startKm)}.`
    : undefined

  return (
    <ConfirmDialog
      open
      title={`${ACTION_LABELS[draft.action]} #${draft.tripId}`}
      description={<>{identification} {texts.consequence}</>}
      confirmLabel={texts.confirmLabel}
      cancelLabel="Voltar"
      loadingLabel="Registrando..."
      loading={submitting}
      confirmDisabled={Boolean(issue) || draft.denied}
      onEntered={() => kmRef.current?.focus()}
      onConfirm={confirmExecution}
      onCancel={onCancel}
    >
      <Box component="form" noValidate onSubmit={(event) => { event.preventDefault(); confirmExecution() }} sx={{ mt: 2 }}>
        <FormField
          label={texts.fieldLabel}
          value={draft.kmText}
          onChange={onKmChange}
          error={draft.fieldError || undefined}
          helperText={startKmHint ?? 'Informe apenas números inteiros. Exemplo: 1500.'}
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          inputRef={kmRef}
          required
        />
      </Box>
      {issue && <Alert severity="warning" role="alert" sx={{ mt: 1 }}>{issue}</Alert>}
      {draft.submitError && <Alert severity="error" role="alert" sx={{ mt: 1 }}>{draft.submitError}</Alert>}
      {(draft.uncertain || issue) && (
        <Button color="inherit" onClick={onRefresh} disabled={refreshing || submitting} sx={{ mt: 1, minHeight: 44 }}>
          {refreshing ? 'Atualizando...' : 'Atualizar situação'}
        </Button>
      )}
    </ConfirmDialog>
  )
}
