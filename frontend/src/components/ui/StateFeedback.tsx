import { Box, Button, CircularProgress, Skeleton, Typography, Alert } from '@mui/material'

export interface StateFeedbackProps {
  isLoading?: boolean
  error?: string | null
  isEmpty?: boolean
  emptyMessage?: string
  emptyActionLabel?: string
  onEmptyAction?: () => void
  onRetry?: () => void
  skeletonVariant?: 'text' | 'rectangular' | 'circular'
  skeletonCount?: number
  skeletonHeight?: number
  children?: React.ReactNode
}

/**
 * Componente unificado para tratamento dos 5 estados visuais de interface
 * em conformidade com as diretrizes do Squad 24 e WCAG 2.2 AA.
 */
export function StateFeedback({
  isLoading = false,
  error = null,
  isEmpty = false,
  emptyMessage = 'Nenhum registro encontrado.',
  emptyActionLabel,
  onEmptyAction,
  onRetry,
  skeletonCount = 3,
  skeletonHeight = 44,
  children,
}: StateFeedbackProps) {
  if (isLoading) {
    return (
      <Box
        role="status"
        aria-busy="true"
        aria-live="polite"
        sx={{ width: '100%', py: 3, display: 'flex', flexDirection: 'column', gap: 2 }}
      >
        <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)' }}>
          Carregando informações, por favor aguarde...
        </span>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
          <CircularProgress size={24} sx={{ color: '#0d47a1' }} />
          <Typography variant="body2" sx={{ color: '#64748b', fontWeight: 500 }}>
            Carregando dados da solicitação e frota...
          </Typography>
        </Box>
        {Array.from({ length: skeletonCount }).map((_, index) => (
          <Skeleton
            key={index}
            variant="rectangular"
            height={skeletonHeight}
            sx={{ borderRadius: 1.5, bgcolor: '#e2e8f0' }}
          />
        ))}
      </Box>
    )
  }

  if (error) {
    return (
      <Box sx={{ my: 2 }}>
        <Alert
          severity="error"
          role="alert"
          aria-live="assertive"
          action={
            onRetry ? (
              <Button
                color="inherit"
                size="small"
                onClick={onRetry}
                sx={{ fontWeight: 600, minHeight: 36 }}
              >
                Tentar novamente
              </Button>
            ) : undefined
          }
          sx={{ borderRadius: 2, fontWeight: 500 }}
        >
          {error}
        </Alert>
      </Box>
    )
  }

  if (isEmpty) {
    return (
      <Box
        role="region"
        aria-label="Aviso de conteúdo vazio"
        sx={{
          py: 6,
          px: 3,
          textAlign: 'center',
          bgcolor: '#ffffff',
          borderRadius: 2,
          border: '1px dashed #cbd5e1',
          my: 2,
        }}
      >
        <Typography variant="h6" sx={{ color: '#334155', fontWeight: 600, mb: 1 }}>
          {emptyMessage}
        </Typography>
        <Typography variant="body2" sx={{ color: '#64748b', mb: 3 }}>
          Verifique o número da solicitação ou consulte as solicitações deferidas no painel.
        </Typography>
        {emptyActionLabel && onEmptyAction && (
          <Button
            variant="contained"
            onClick={onEmptyAction}
            sx={{
              bgcolor: '#0d47a1',
              '&:hover': { bgcolor: '#0b3c89' },
              minHeight: 44,
              px: 3,
              fontWeight: 600,
            }}
          >
            {emptyActionLabel}
          </Button>
        )}
      </Box>
    )
  }

  return <>{children}</>
}
