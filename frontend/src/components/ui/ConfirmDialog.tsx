import { useId } from 'react'
import type { ReactNode } from 'react'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material'
import type { SxProps, Theme } from '@mui/material'

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
  paperSx?: SxProps<Theme>
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
  paperSx,
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
      slotProps={paperSx ? { paper: { sx: paperSx } } : undefined}
    >
      <DialogTitle id={`${baseId}-title`}>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText id={`${baseId}-description`} component="div">
          {description}
        </DialogContentText>
        {children}
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onCancel} disabled={loading} color="inherit" sx={{ minHeight: 44 }}>
          Cancelar
        </Button>
        <Button
          onClick={onConfirm}
          disabled={loading || confirmDisabled}
          variant="contained"
          color={danger ? 'error' : 'primary'}
          aria-busy={loading ? 'true' : undefined}
          sx={{ minHeight: 44 }}
        >
          {loading ? 'Processando...' : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
