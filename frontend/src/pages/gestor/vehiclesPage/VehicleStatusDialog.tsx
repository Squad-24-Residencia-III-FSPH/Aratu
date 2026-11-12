import { useState } from 'react'
import { Alert } from '@mui/material'
import type { ApiRequest } from '../../../api/client'
import ConfirmDialog from '../../../components/ui/ConfirmDialog'
import { FormField, FormSelect } from '../../../components/ui/FormField'
import { changeVehicleStatus, VehicleRequestError } from '../../../services/vehiclesService'
import {
  VEHICLE_STATUS_LABELS,
  VEHICLE_STATUS_TRANSITIONS,
  statusActionLabel,
} from '../../../vehicles/vehicleTypes'
import type { Vehicle, VehicleStatus } from '../../../vehicles/vehicleTypes'

interface VehicleStatusDialogProps {
  api: ApiRequest
  vehicle: Vehicle
  reportedBy: string
  onSaved: (vehicle: Vehicle) => void
  onCancel: () => void
  onConflict: (message: string) => void
}

/** Confirma a transição de situação permitida pela máquina de estados. */
export default function VehicleStatusDialog({
  api,
  vehicle,
  reportedBy,
  onSaved,
  onCancel,
  onConflict,
}: VehicleStatusDialogProps) {
  const allowedTargets = VEHICLE_STATUS_TRANSITIONS[vehicle.status]
  const [target, setTarget] = useState<VehicleStatus | ''>(allowedTargets[0] ?? '')
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState<string>()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const targetOptions = allowedTargets.map((status) => ({
    value: status,
    label: VEHICLE_STATUS_LABELS[status],
  }))

  async function handleConfirm() {
    if (!target) return
    if (!reason.trim()) {
      setReasonError('Informe a justificativa da mudança de situação.')
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    try {
      const saved = await changeVehicleStatus(api, vehicle.id, {
        status: target,
        expectedRevision: vehicle.revision,
        reportedBy,
        reason: reason.trim(),
      })
      onSaved(saved)
    } catch (error) {
      if (error instanceof VehicleRequestError) {
        if (error.kind === 'conflict-revision') {
          onConflict(error.message)
          return
        }
        setSubmitError(
          error.kind === 'forbidden'
            ? 'Seu perfil não tem permissão para alterar a situação do veículo.'
            : error.message,
        )
        return
      }
      setSubmitError('Não foi possível alterar a situação do veículo. Tente novamente.')
    } finally {
      setSubmitting(false)
    }
  }

  const confirmLabel = target ? statusActionLabel(target) : 'Confirmar'

  return (
    <ConfirmDialog
      open
      title="Alterar situação do veículo"
      description={`Situação atual: ${VEHICLE_STATUS_LABELS[vehicle.status]}. Placa ${vehicle.licensePlate}.`}
      confirmLabel={confirmLabel}
      onConfirm={handleConfirm}
      onCancel={onCancel}
      loading={submitting}
      confirmDisabled={!target}
    >
      {allowedTargets.length === 0 ? (
        <Alert severity="info" sx={{ mt: 2 }}>
          Nenhuma mudança de situação está disponível para este veículo.
        </Alert>
      ) : (
        <>
          {submitError && <Alert severity="error" sx={{ mt: 2 }}>{submitError}</Alert>}
          <FormSelect
            label="Nova situação"
            value={target}
            onChange={(value) => setTarget(value as VehicleStatus | '')}
            options={targetOptions}
            required
          />
          <FormField
            label="Justificativa"
            value={reason}
            onChange={(value) => {
              setReason(value)
              setReasonError(undefined)
            }}
            error={reasonError}
            helperText="Registrada na história do veículo e na auditoria."
            required
            multiline
            minRows={2}
          />
        </>
      )}
    </ConfirmDialog>
  )
}
