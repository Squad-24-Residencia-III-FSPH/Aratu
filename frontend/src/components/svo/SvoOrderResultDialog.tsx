import { useEffect, useRef, useState } from 'react'
import { Alert, Box, Button, Typography } from '@mui/material'
import type { OrderResultDraft } from '../../hooks/useSvoOrders'
import { MISSING_DISPATCH, SVO_ORDER_LABELS } from '../../svo/svoOrderPresentation'
import type { SvoOrderResult } from '../../svo/svoOrderTypes'
import ConfirmDialog from '../ui/ConfirmDialog'
import { FormField, FormSelect } from '../ui/FormField'
import { SVO_FOCUS_SX, SVO_SELECT_FIELD_SX, SVO_TEXT_FIELD_SX } from './svoOrderStyles'

/** Propriedades do diálogo de registro e confirmação de resultado da ordem SVO. */
export interface SvoOrderResultDialogProps {
  /** Rascunho atual do encerramento em memória. */
  draft: OrderResultDraft
  /** Indica envio em andamento para bloquear controles e exibir estado ocupado. */
  submitting: boolean
  /** Indica reconciliação em andamento após falha de comunicação. */
  reconciling: boolean
  /** Indica resultado incerto exigindo consulta antes de nova tentativa. */
  uncertain: boolean
  /** Bloqueia ações quando a lista está carregando, desatualizada ou em envio. */
  disabled: boolean
  /** Atualiza os campos do rascunho em memória. */
  onChange: (patch: Partial<Pick<OrderResultDraft, 'result' | 'failureReason' | 'notes'>>) => void
  /** Avança do formulário para a etapa de revisão. */
  onReview: () => void
  /** Retorna da revisão ao formulário preservando os dados preenchidos. */
  onBack: () => void
  /** Fecha o diálogo quando não há envio em curso. */
  onClose: () => void
  /** Confirma e envia o encerramento para a API. */
  onConfirm: () => void
  /** Executa GET de reconciliação quando o resultado do envio é incerto. */
  onReconcile: () => void
}

/**
 * Formulário e revisão de encerramento da ordem SVO em dois passos no mesmo diálogo,
 * preservando o rascunho em memória e garantindo foco acessível (WCAG 2.2 AA).
 */
export default function SvoOrderResultDialog({
  draft,
  submitting,
  reconciling,
  uncertain,
  disabled,
  onChange,
  onReview,
  onBack,
  onClose,
  onConfirm,
  onReconcile,
}: SvoOrderResultDialogProps) {
  const formRef = useRef<HTMLDivElement>(null)
  const confirmAnchorRef = useRef<HTMLDivElement>(null)
  const reasonRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const prevStepRef = useRef<OrderResultDraft['step'] | null>(null)
  const [reviewAttempt, setReviewAttempt] = useState(0)
  const options = draft.order.allowedResults.map((value) => ({ value, label: SVO_ORDER_LABELS[value] }))
  const busy = submitting || reconciling

  function handleReview(): void {
    setReviewAttempt((count) => count + 1)
    onReview()
  }

  useEffect(() => {
    const stepChanged = prevStepRef.current !== draft.step
    prevStepRef.current = draft.step

    if (draft.step === 'confirm') {
      if (!stepChanged) return
      // Move foco imediatamente para a ação segura, impedindo envio acidental por duplo Enter na abertura.
      const focusSafeAction = () => {
        const dialog = confirmAnchorRef.current?.closest('[role="dialog"]')
        const buttons = dialog ? Array.from(dialog.querySelectorAll<HTMLButtonElement>('.MuiDialogActions-root button')) : []
        const cancelButton = buttons.find((button) => button.textContent?.includes('Voltar ao formulário')) ?? buttons[0]
        if (cancelButton && !cancelButton.disabled) cancelButton.focus()
      }
      focusSafeAction()
      const frame = requestAnimationFrame(() => {
        const dialog = confirmAnchorRef.current?.closest('[role="dialog"]')
        const active = document.activeElement
        const confirmButton = dialog?.querySelector<HTMLButtonElement>('.MuiDialogActions-root button:last-of-type')
        if (!active || active === document.body || active === confirmButton) focusSafeAction()
      })
      return () => cancelAnimationFrame(frame)
    }

    const hasValidationError = Boolean(draft.resultError || draft.reasonError)
    if (!stepChanged && !hasValidationError) return

    const frame = requestAnimationFrame(() => {
      if (draft.resultError) {
        formRef.current?.querySelector<HTMLElement>('[role="combobox"]')?.focus()
        return
      }
      if (draft.reasonError && reasonRef.current) {
        reasonRef.current.focus()
        return
      }
      formRef.current?.querySelector<HTMLElement>('[role="combobox"], input, textarea')?.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [draft.step, draft.resultError, draft.reasonError, reviewAttempt])

  if (draft.step === 'confirm') {
    return (
      <ConfirmDialog
        open
        title={`Confirmar encerramento da ordem #${draft.order.id}`}
        sx={SVO_FOCUS_SX}
        description={
          <Box ref={confirmAnchorRef}>
            <Typography>Local do despacho: {draft.order.dispatch.location ?? MISSING_DISPATCH}</Typography>
            <Typography sx={{ mt: 1 }}>Resultado: {draft.result ? SVO_ORDER_LABELS[draft.result] : ''}</Typography>
            {draft.result === 'NOT_PERFORMED' && (
              <Typography>Motivo da não realização: {draft.failureReason.trim()}</Typography>
            )}
            <Typography>Observações: {draft.notes.trim() || 'Não informadas'}</Typography>
            <Typography sx={{ mt: 1 }}>
              Após confirmar, a ordem não poderá mais ser alterada e o horário atual do servidor será registrado.
            </Typography>
          </Box>
        }
        confirmLabel="Confirmar encerramento"
        cancelLabel="Voltar ao formulário"
        loading={submitting}
        confirmDisabled={disabled || draft.blocked}
        onConfirm={onConfirm}
        onCancel={onBack}
        autoFocusCancel
      >
        {draft.error && <Alert severity="error" sx={{ mt: 2 }}>{draft.error}</Alert>}
        {draft.blocked && !uncertain && (
          <Typography sx={{ mt: 1 }}>Volte à lista atualizada e escolha novamente a ação disponível.</Typography>
        )}
        {uncertain && (
          <Button color="inherit" disabled={busy} onClick={onReconcile} sx={{ mt: 1, minHeight: 44 }}>
            {reconciling ? 'Consultando...' : 'Consultar situação'}
          </Button>
        )}
      </ConfirmDialog>
    )
  }

  return (
    <ConfirmDialog
      open
      title={`Encerrar ordem #${draft.order.id}`}
      sx={SVO_FOCUS_SX}
      description={
        <>
          <Typography>Local do despacho: {draft.order.dispatch.location ?? MISSING_DISPATCH}</Typography>
          {draft.order.dispatch.location !== draft.order.current.location && (
            <Typography>Local atual: {draft.order.current.location}</Typography>
          )}
        </>
      }
      confirmLabel="Revisar encerramento"
      cancelLabel="Cancelar"
      confirmDisabled={disabled || draft.blocked}
      onConfirm={handleReview}
      onCancel={onClose}
    >
      <Box ref={formRef} sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <FormSelect
          label="Resultado do atendimento"
          required
          value={draft.result}
          emptyLabel="Selecione o resultado"
          displayEmpty
          autoFocus
          disabled={disabled || busy}
          error={draft.resultError}
          options={options}
          sx={SVO_SELECT_FIELD_SX}
          onChange={(value) => onChange({ result: value as SvoOrderResult | '' })}
        />
        {draft.result === 'NOT_PERFORMED' && (
          <FormField
            label="Motivo da não realização"
            required
            multiline
            minRows={2}
            inputRef={reasonRef}
            value={draft.failureReason}
            disabled={disabled || busy}
            error={draft.reasonError}
            sx={SVO_TEXT_FIELD_SX}
            onChange={(value) => onChange({ failureReason: value })}
          />
        )}
        <FormField
          label="Observações"
          multiline
          minRows={2}
          value={draft.notes}
          disabled={disabled || busy}
          helperText="Opcional"
          sx={SVO_TEXT_FIELD_SX}
          onChange={(value) => onChange({ notes: value })}
        />
      </Box>
      {draft.error && <Alert severity="error" sx={{ mt: 2 }}>{draft.error}</Alert>}
    </ConfirmDialog>
  )
}
