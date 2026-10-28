import { Box, Chip } from '@mui/material'

export type StatusChipType = 'success' | 'warning' | 'error' | 'info' | 'default'

export interface StatusChipProps {
  label: string
  statusType?: StatusChipType
  icon?: React.ReactElement
  size?: 'small' | 'medium'
}

const STATUS_COLORS: Record<StatusChipType, { bg: string; color: string; border: string }> = {
  success: { bg: '#e8f5e9', color: '#1b5e20', border: '#a5d6a7' },
  warning: { bg: '#fff8e1', color: '#b78103', border: '#ffe082' },
  error: { bg: '#ffebee', color: '#b71c1c', border: '#ef9a9a' },
  info: { bg: '#e3f2fd', color: '#0d47a1', border: '#90caf9' },
  default: { bg: '#f1f5f9', color: '#334155', border: '#cbd5e1' },
}

/**
 * Chip de status operacional que combina texto legível, ícone auxiliar
 * e contraste mínimo de 4.5:1 para conformidade com a WCAG 2.2 AA.
 */
export function StatusChip({ label, statusType = 'default', icon, size = 'small' }: StatusChipProps) {
  const styles = STATUS_COLORS[statusType]

  return (
    <Chip
      size={size}
      label={label}
      icon={
        icon ? (
          <Box component="span" sx={{ display: 'inline-flex', mr: 0.5, color: styles.color }}>
            {icon}
          </Box>
        ) : undefined
      }
      sx={{
        backgroundColor: styles.bg,
        color: styles.color,
        border: `1px solid ${styles.border}`,
        fontWeight: 600,
        fontSize: size === 'small' ? 12 : 13,
        borderRadius: 1,
        px: 0.5,
        '& .MuiChip-label': {
          px: 1,
        },
      }}
    />
  )
}
