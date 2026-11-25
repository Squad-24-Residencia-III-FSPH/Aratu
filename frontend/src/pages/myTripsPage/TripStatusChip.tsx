import DirectionsCarOutlinedIcon from '@mui/icons-material/DirectionsCarOutlined'
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined'
import type { SvgIconComponent } from '@mui/icons-material'
import { Chip } from '@mui/material'
import type { StatusTone } from '../../components/ui/StatusChip'
import { TRIP_STATUS_LABELS, TRIP_STATUS_TONES } from '../../trips/tripPresentation'
import type { DriverTripStatus } from '../../trips/tripTypes'

const TONE_PALETTE: Readonly<Record<StatusTone, { background: string; foreground: string }>> = {
  success: { background: '#dcfce7', foreground: '#14532d' },
  warning: { background: '#fef3c7', foreground: '#78350f' },
  info: { background: '#dbeafe', foreground: '#1e3a8a' },
  neutral: { background: '#f1f5f9', foreground: '#334155' },
}

const STATUS_ICONS: Readonly<Record<DriverTripStatus, SvgIconComponent>> = {
  SCHEDULED: ScheduleOutlinedIcon,
  IN_PROGRESS: DirectionsCarOutlinedIcon,
}

export interface TripStatusChipProps {
  /** Situação operacional da viagem exibida ao motorista. */
  status: DriverTripStatus
}

/**
 * Chip semântico de situação da viagem combinando ícone, cor de alto contraste e texto explícito.
 */
export default function TripStatusChip({ status }: TripStatusChipProps) {
  const tone = TRIP_STATUS_TONES[status]
  const colors = TONE_PALETTE[tone]
  const Icon = STATUS_ICONS[status]

  return (
    <Chip
      size="small"
      icon={<Icon aria-hidden="true" sx={{ fontSize: 16 }} />}
      label={TRIP_STATUS_LABELS[status]}
      sx={{
        backgroundColor: colors.background,
        color: colors.foreground,
        fontWeight: 700,
        fontSize: '0.75rem',
        height: 26,
        border: `1px solid ${colors.foreground}33`,
        '& .MuiChip-icon': { color: colors.foreground, ml: 0.75 },
      }}
    />
  )
}
