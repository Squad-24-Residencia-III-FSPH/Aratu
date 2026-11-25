import { useCallback, useEffect, useRef, useState } from 'react'

export interface DiscardConfirmationDialogProps {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  cancelLabel: string
  danger: boolean
  onConfirm: () => void
  onCancel: () => void
}

export interface UnsavedChangesGuardOptions {
  /** Indica se o formulário possui alterações não salvas no momento. */
  isDirty: boolean
  /** Título exibido no diálogo de confirmação de descarte. */
  title?: string
  /** Descrição clara do objeto/alterações que serão descartadas. */
  description?: string
  /** Rótulo explícito do botão destrutivo de confirmação. */
  confirmLabel?: string
  /** Rótulo explícito do botão que preserva o preenchimento atual. */
  cancelLabel?: string
  /** Habilita alerta nativo do navegador ao fechar/recarregar aba com alterações pendentes. */
  warnOnBeforeUnload?: boolean
  /** Callback opcional executado ao confirmar o descarte (ex.: limpeza de rascunho em memória). */
  onDiscard?: () => void
}

export interface UnsavedChangesGuard {
  /** Indica se há alteração pendente no formulário protegido. */
  isDirty: boolean
  /** Indica se o diálogo de confirmação de descarte está aberto. */
  confirmOpen: boolean
  /** Solicita saída/fechamento: executa imediatamente se limpo, ou abre confirmação se sujo. */
  requestDiscard: (action: () => void) => void
  /** Confirma o descarte, executa `onDiscard` e prossegue com a ação pendente. */
  confirmDiscard: () => void
  /** Cancela o descarte e preserva o preenchimento atual. */
  cancelDiscard: () => void
  /** Propriedades acessíveis compatíveis com `ConfirmDialog` (`src/components/ui/ConfirmDialog.tsx`). */
  dialogProps: DiscardConfirmationDialogProps
}

const DEFAULT_TITLE = 'Descartar alterações não salvas?'
const DEFAULT_DESCRIPTION = 'Existem dados preenchidos que ainda não foram enviados. Se você sair agora, essas alterações serão perdidas.'
const DEFAULT_CONFIRM_LABEL = 'Descartar alterações'
const DEFAULT_CANCEL_LABEL = 'Continuar editando'

/**
 * Verifica de forma pura se há alterações em aberto comparando um estado inicial e atual,
 * ignorando espaços excedentes em campos textuais opcionais.
 *
 * @param current - Valores atuais do formulário.
 * @param initial - Valores de referência iniciais.
 * @returns `true` quando qualquer campo monitorado diferir do estado inicial.
 */
export function hasFormChanges<T extends Record<string, unknown>>(current: T, initial: T): boolean {
  const keys = new Set([...Object.keys(initial), ...Object.keys(current)])
  for (const key of keys) {
    if (!Object.is(current[key], initial[key])) return true
  }
  return false
}

/**
 * Hook reutilizável para proteger formulários com alterações não salvas contra perda acidental.
 *
 * Oferece fluxo uniforme de confirmação de descarte compatível com `ConfirmDialog`
 * e prevenção opcional de fechamento/recarga da aba via `beforeunload`.
 *
 * @param options - Configuração de estado sujo, textos contextuais e limpeza de rascunho.
 * @returns Controles e `dialogProps` acessíveis para integração direta em páginas e diálogos.
 */
export function useUnsavedChangesGuard({
  isDirty,
  title = DEFAULT_TITLE,
  description = DEFAULT_DESCRIPTION,
  confirmLabel = DEFAULT_CONFIRM_LABEL,
  cancelLabel = DEFAULT_CANCEL_LABEL,
  warnOnBeforeUnload = true,
  onDiscard,
}: UnsavedChangesGuardOptions): UnsavedChangesGuard {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const pendingActionRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!isDirty || !warnOnBeforeUnload || typeof window === 'undefined') return
    function handleBeforeUnload(event: BeforeUnloadEvent): void {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty, warnOnBeforeUnload])

  const requestDiscard = useCallback((action: () => void): void => {
    if (!isDirty) {
      action()
      return
    }
    pendingActionRef.current = action
    setConfirmOpen(true)
  }, [isDirty])

  const confirmDiscard = useCallback((): void => {
    const pending = pendingActionRef.current
    pendingActionRef.current = null
    setConfirmOpen(false)
    onDiscard?.()
    pending?.()
  }, [onDiscard])

  const cancelDiscard = useCallback((): void => {
    pendingActionRef.current = null
    setConfirmOpen(false)
  }, [])

  return {
    isDirty,
    confirmOpen,
    requestDiscard,
    confirmDiscard,
    cancelDiscard,
    dialogProps: {
      open: confirmOpen,
      title,
      description,
      confirmLabel,
      cancelLabel,
      danger: true,
      onConfirm: confirmDiscard,
      onCancel: cancelDiscard,
    },
  }
}
