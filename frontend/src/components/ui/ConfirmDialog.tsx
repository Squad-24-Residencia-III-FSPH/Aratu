import { useId } from 'react'
import type { ReactNode } from 'react'
import type { SxProps, Theme } from '@mui/material/styles'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material'
import type { ButtonProps, SxProps, Theme } from '@mui/material'

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
  paperSx?: SxProps<Theme>
  actionsSx?: SxProps<Theme>
  cancelSx?: SxProps<Theme>
  confirmSx?: SxProps<Theme>
}

/** Diálogo de confirmação acessível, com foco preso e fechamento por `Esc`. */
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
  paperSx,
  actionsSx,
  cancelSx,
  confirmSx,
}: ConfirmDialogProps) {
  const baseId = useId()

  return (
    <Dialog
      open={open}
      onClose={loading ? undefined : onCancel}
      aria-labelledby={`${baseId}-title`}
      aria-describedby={`${baseId}-description`}
      fullWidth
      maxWidth="xs"
      sx={sx}
      slotProps={paperSx ? { paper: { sx: paperSx } } : undefined}
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
          sx={cancelSx ?? { minHeight: 44 }}
        >
          {cancelLabel}
        </Button>
        <Button
          onClick={onConfirm}
          disabled={loading || confirmDisabled}
          variant="contained"
          color={confirmColor ?? (danger ? 'error' : 'primary')}
          aria-busy={loading ? 'true' : undefined}
          sx={confirmSx ?? { minHeight: 44 }}
        >
          {loading ? loadingLabel : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
