import { cloneElement, isValidElement } from 'react'
import type { ReactElement } from 'react'
import BlockOutlinedIcon from '@mui/icons-material/BlockOutlined'
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined'
import type { SvgIconComponent } from '@mui/icons-material'
import { Chip } from '@mui/material'

export type StatusTone = 'success' | 'warning' | 'info' | 'neutral'

const TONES: Readonly<Record<StatusTone, { background: string; foreground: string }>> = {
  success: { background: '#dcfce7', foreground: '#14532d' },
  warning: { background: '#fef3c7', foreground: '#78350f' },
  info: { background: '#dbeafe', foreground: '#1e3a8a' },
  neutral: { background: '#f1f5f9', foreground: '#334155' },
}

const DEFAULT_TONE_ICONS: Readonly<Record<StatusTone, SvgIconComponent>> = {
  success: CheckCircleOutlinedIcon,
  warning: WarningAmberOutlinedIcon,
  info: InfoOutlinedIcon,
  neutral: BlockOutlinedIcon,
}

export interface StatusChipProps {
  /** Texto explícito da situação exibida ao usuário. */
  label: string
  /** Tom semântico que define paleta de alto contraste e ícone padrão. */
  tone: StatusTone
  /** Ícone semântico opcional para sobrescrever o ícone padrão do tom. */
  icon?: ReactElement
}

function resolveSemanticIcon(tone: StatusTone, customIcon?: ReactElement): ReactElement {
  if (customIcon && isValidElement(customIcon)) {
    return cloneElement(customIcon as ReactElement<Record<string, unknown>>, {
      'aria-hidden': true,
      focusable: false,
    })
  }
  const DefaultIcon = DEFAULT_TONE_ICONS[tone]
  return <DefaultIcon aria-hidden="true" focusable="false" />
}

/** Chip de situação que combina texto, paleta de alto contraste e ícone SVG semântico (não depende só de cor). */
export default function StatusChip({ label, tone, icon }: StatusChipProps) {
  const colors = TONES[tone]
  const semanticIcon = resolveSemanticIcon(tone, icon)

  return (
    <Chip
      size="small"
      icon={semanticIcon}
      label={label}
      sx={{
        backgroundColor: colors.background,
        color: colors.foreground,
        fontWeight: 700,
        fontSize: '0.75rem',
        height: 26,
        border: `1px solid ${colors.foreground}4d`,
        '& .MuiChip-icon': {
          color: colors.foreground,
          fontSize: 16,
          ml: 0.75,
          mr: -0.25,
        },
      }}
    />
  )
}
