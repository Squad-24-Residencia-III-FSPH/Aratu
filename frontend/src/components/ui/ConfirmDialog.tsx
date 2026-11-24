import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material'
import type { ButtonProps, SxProps, Theme } from '@mui/material'
import { accessibleControls } from './accessibleControls'

export interface ConfirmDialogProps {
  open: boolean
  title: string
  description: ReactNode
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  loading?: boolean
  confirmDisabled?: boolean
  danger?: boolean
  children?: ReactNode
  cancelLabel?: string
  loadingLabel?: string
  confirmColor?: ButtonProps['color']
  autoFocusCancel?: boolean
  /** Executado após a animação de abertura, quando o campo do domínio já pode receber foco. */
  onEntered?: () => void
  /** Executado após a animação de fechamento, quando o foco já pode ir para o destino do fluxo. */
  onExited?: () => void
  /** Estilos do diálogo, incluindo ajustes de controles dos fluxos que o reutilizam. */
  paperSx?: SxProps<Theme>
  actionsSx?: SxProps<Theme>
  cancelSx?: SxProps<Theme>
  confirmSx?: SxProps<Theme>
  /** Permite que o domínio aplique seus tokens de contraste também ao diálogo portado. */
  sx?: SxProps<Theme>
}

const baseDialogButtonSx = {
  minHeight: 44,
  minWidth: 44,
  scrollMarginTop: '80px',
  '&.Mui-focusVisible, &:focus-visible': {
    outline: '3px solid #b94700',
    outlineOffset: 2,
  },
} as const

function mergeSx(base: SxProps<Theme>, custom?: SxProps<Theme>): SxProps<Theme> {
  if (!custom) return base
  return [
    ...(Array.isArray(base) ? base : [base]),
    ...(Array.isArray(custom) ? custom : [custom]),
  ]
}

function restoreTriggerFocus(target: HTMLElement | null) {
  const active = document.activeElement
  if ((!active || active === document.body) && target?.isConnected) {
    target.focus()
  }
}

/** Diálogo de confirmação acessível, com foco preso, fechamento por `Esc` e devolução garantida de foco. */
export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  onConfirm,
  onCancel,
  loading = false,
  confirmDisabled = false,
  danger = false,
  children,
  cancelLabel = 'Cancelar',
  loadingLabel = 'Processando...',
  confirmColor,
  autoFocusCancel = false,
  onEntered,
  onExited,
  sx,
  paperSx,
  actionsSx,
  cancelSx,
  confirmSx,
}: ConfirmDialogProps) {
  const baseId = useId()
  const paperRef = useRef<HTMLDivElement | null>(null)
  const returnFocusToRef = useRef<HTMLElement | null>(null)
  const isOpenRef = useRef(open)

  useEffect(() => {
    isOpenRef.current = open
    if (open || typeof document === 'undefined') return

    const captureFocusedElement = () => {
      const active = document.activeElement
      if (active instanceof HTMLElement && active !== document.body && !paperRef.current?.contains(active)) {
        returnFocusToRef.current = active
      }
    }

    captureFocusedElement()
    document.addEventListener('focusin', captureFocusedElement)
    return () => {
      document.removeEventListener('focusin', captureFocusedElement)
    }
  }, [open])

  useEffect(() => {
    return () => {
      if (isOpenRef.current && !onExited) {
        const target = returnFocusToRef.current
        queueMicrotask(() => restoreTriggerFocus(target))
      }
    }
  }, [onExited])

  function handleExited() {
    onExited?.()
    restoreTriggerFocus(returnFocusToRef.current)
  }

  return (
    <Dialog
      open={open}
      onClose={loading ? undefined : onCancel}
      aria-labelledby={`${baseId}-title`}
      aria-describedby={`${baseId}-description`}
      fullWidth
      maxWidth="xs"
      sx={mergeSx(accessibleControls, sx)}
      slotProps={{
        paper: {
          ref: paperRef,
          sx: mergeSx({ scrollMarginTop: '80px' }, paperSx),
        },
        transition: { onEntered, onExited: handleExited },
      }}
    >
      <DialogTitle id={`${baseId}-title`}>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText id={`${baseId}-description`} component="div">
          {description}
        </DialogContentText>
        {children}
      </DialogContent>
      <DialogActions sx={actionsSx ?? { p: 2 }}>
        <Button
          onClick={onCancel}
          disabled={loading}
          color="inherit"
          autoFocus={autoFocusCancel}
          sx={mergeSx(baseDialogButtonSx, cancelSx)}
        >
          {cancelLabel}
        </Button>
        <Button
          onClick={onConfirm}
          disabled={loading || confirmDisabled}
          variant="contained"
          color={confirmColor ?? (danger ? 'error' : 'primary')}
          aria-busy={loading ? 'true' : undefined}
          sx={mergeSx(baseDialogButtonSx, confirmSx)}
        >
          {loading ? loadingLabel : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
