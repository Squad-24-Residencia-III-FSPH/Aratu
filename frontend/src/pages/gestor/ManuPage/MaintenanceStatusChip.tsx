import { Chip } from '@mui/material'
import type { SvgIconComponent } from '@mui/icons-material'
import BlockOutlinedIcon from '@mui/icons-material/BlockOutlined'
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined'
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined'
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined'
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined'
import type { StatusTone } from '../../../components/ui/StatusChip'
import { STATUS_LABELS } from '../../../maintenance/maintenanceTypes'
import type { MaintenanceStatus } from '../../../maintenance/maintenanceTypes'
import { VEHICLE_STATUS_LABELS } from '../../../vehicles/vehicleTypes'
import type { VehicleStatus } from '../../../vehicles/vehicleTypes'

const TONE_PALETTE: Readonly<Record<StatusTone, { background: string; foreground: string }>> = {
  success: { background: '#dcfce7', foreground: '#14532d' },
  warning: { background: '#fef3c7', foreground: '#78350f' },
  info: { background: '#dbeafe', foreground: '#1e3a8a' },
  neutral: { background: '#f1f5f9', foreground: '#334155' },
}

const ORDER_STATUS_CONFIG: Readonly<Record<MaintenanceStatus, { tone: StatusTone; Icon: SvgIconComponent }>> = {
  OPEN: { tone: 'warning', Icon: ScheduleOutlinedIcon },
  IN_PROGRESS: { tone: 'info', Icon: BuildOutlinedIcon },
  DONE: { tone: 'success', Icon: CheckCircleOutlinedIcon },
  CANCELED: { tone: 'neutral', Icon: CancelOutlinedIcon },
}

const VEHICLE_STATUS_CONFIG: Readonly<Record<VehicleStatus, { tone: StatusTone; Icon: SvgIconComponent }>> = {
  AVAILABLE: { tone: 'success', Icon: CheckCircleOutlinedIcon },
  IN_MAINTENANCE: { tone: 'warning', Icon: BuildOutlinedIcon },
  INACTIVE: { tone: 'neutral', Icon: BlockOutlinedIcon },
}

interface SemanticStatusChipProps {
  label: string
  tone: StatusTone
  Icon: SvgIconComponent
}

function SemanticStatusChip({ label, tone, Icon }: SemanticStatusChipProps) {
  const colors = TONE_PALETTE[tone]
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
        '& .MuiChip-icon': { color: colors.foreground },
      }}
    />
  )
}

export interface MaintenanceStatusChipProps {
  status: MaintenanceStatus
}

/** Chip semântico da ordem de manutenção com ícone distintivo por situação, cor e texto. */
export function MaintenanceStatusChip({ status }: MaintenanceStatusChipProps) {
  const { tone, Icon } = ORDER_STATUS_CONFIG[status]
  return <SemanticStatusChip label={STATUS_LABELS[status]} tone={tone} Icon={Icon} />
}

export interface VehicleStatusChipProps {
  status: VehicleStatus
}

/** Chip semântico da situação real do veículo associado à manutenção. */
export function VehicleStatusChip({ status }: VehicleStatusChipProps) {
  const { tone, Icon } = VEHICLE_STATUS_CONFIG[status]
  return <SemanticStatusChip label={VEHICLE_STATUS_LABELS[status]} tone={tone} Icon={Icon} />
}
