import { Alert, Box, Button, CircularProgress, Typography } from '@mui/material'
import type { SxProps, Theme } from '@mui/material'

export type StateFeedbackKind = 'loading' | 'empty' | 'error' | 'forbidden' | 'partial'

export interface StateFeedbackProps {
  kind: StateFeedbackKind
  title?: string
  description?: string
  actionLabel?: string
  onAction?: () => void
  centered?: boolean
  sx?: SxProps<Theme>
}

/** Feedback dos estados carregando, vazio, erro, acesso negado e parcial. */
export default function StateFeedback({
  kind,
  title,
  description,
  actionLabel,
  onAction,
  centered = false,
  sx,
}: StateFeedbackProps) {
  const centeredAlertSx = {
    mb: 0,
    alignItems: 'center',
    flexDirection: 'column',
    textAlign: 'center',
    '& .MuiAlert-icon': { mr: 0, mb: 2 },
    '& .MuiAlert-message': { width: '100%' },
    '& .MuiAlert-action': { mt: 1, mr: 0, p: 0 },
  }
  const alertSx: SxProps<Theme> = sx
    ? [
        centered ? centeredAlertSx : { mb: 3, alignItems: 'center' },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]
    : centered ? centeredAlertSx : { mb: 3, alignItems: 'center' }

  if (kind === 'loading') {
    return (
      <Box
        role="status"
        aria-live="polite"
        aria-busy="true"
        sx={sx ?? { display: 'flex', alignItems: 'center', gap: 1.5, py: 4 }}
      >
        <CircularProgress size={24} />
        <Typography>{title ?? 'Carregando veículos...'}</Typography>
      </Box>
    )
  }

  const severity = kind === 'partial' ? 'warning' : kind === 'empty' ? 'info' : 'error'
  const messages: Record<Exclude<StateFeedbackKind, 'loading'>, string> = {
    empty: 'Nenhum veículo encontrado com os filtros atuais.',
    error: 'Não foi possível carregar os veículos.',
    forbidden: 'Seu perfil não tem permissão para consultar veículos.',
    partial: 'A lista exibida pode estar desatualizada.',
  }

  return (
    <Alert
      severity={severity}
      sx={alertSx}
      action={onAction && actionLabel
        ? <Button color="inherit" onClick={onAction} sx={{ minHeight: 44 }}>{actionLabel}</Button>
        : undefined}
    >
      {title ?? messages[kind]}
      {description && (
        <Typography variant="body2" sx={{ mt: 0.5 }}>
          {description}
        </Typography>
      )}
    </Alert>
  )
}
