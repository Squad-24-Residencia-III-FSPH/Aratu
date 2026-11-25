import BlockOutlinedIcon from '@mui/icons-material/BlockOutlined'
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined'
import { Chip } from '@mui/material'

export interface ServiceStatusChipProps {
  active: boolean
}

const ACTIVE_COLORS = { background: '#dcfce7', foreground: '#14532d' } as const
const INACTIVE_COLORS = { background: '#f1f5f9', foreground: '#334155' } as const

/** Chip semântico de situação do tipo de serviço com ícone distinto, cor de alto contraste e rótulo explícito. */
export default function ServiceStatusChip({ active }: ServiceStatusChipProps) {
  const colors = active ? ACTIVE_COLORS : INACTIVE_COLORS
  const label = active ? 'Ativo' : 'Inativo'
  const Icon = active ? CheckCircleOutlinedIcon : BlockOutlinedIcon

  return (
    <Chip
      size="small"
      icon={<Icon aria-hidden="true" sx={{ fontSize: 16 }} />}
      label={label}
      sx={{
        backgroundColor: colors.background,
        color: colors.foreground,
        fontWeight: 700,
        fontSize: '0.75rem',
        height: 26,
        border: `1px solid ${colors.foreground}33`,
        '& .MuiChip-icon': {
          color: colors.foreground,
          ml: 0.75,
        },
      }}
    />
  )
}
