import { Box, Chip } from '@mui/material'

export type StatusTone = 'success' | 'warning' | 'info' | 'neutral'

const TONES: Readonly<Record<StatusTone, { background: string; foreground: string }>> = {
  success: { background: '#dcfce7', foreground: '#14532d' },
  warning: { background: '#fef3c7', foreground: '#78350f' },
  info: { background: '#dbeafe', foreground: '#1e3a8a' },
  neutral: { background: '#f1f5f9', foreground: '#334155' },
}

export interface StatusChipProps {
  label: string
  tone: StatusTone
}

/** Chip de situação que combina texto, cor e marcador (não depende só de cor). */
export default function StatusChip({ label, tone }: StatusChipProps) {
  const colors = TONES[tone]
  return (
    <Chip
      size="small"
      label={
        <>
          <Box
            component="span"
            aria-hidden="true"
            sx={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: colors.foreground,
              mr: 0.75,
            }}
          />
          {label}
        </>
      }
      sx={{
        backgroundColor: colors.background,
        color: colors.foreground,
        fontWeight: 700,
        fontSize: '0.75rem',
        height: 26,
        border: `1px solid ${colors.foreground}33`,
      }}
    />
  )
}
