import { useRef, useState } from 'react'
import { Alert, Box, Button } from '@mui/material'
import type { ApiRequest } from '../../../api/client'
import ConfirmDialog from '../../../components/ui/ConfirmDialog'
import { FormField } from '../../../components/ui/FormField'
import { accessibleControls } from '../../../components/ui/accessibleControls'
import {
  isUncertainServiceError,
  listFleetServices,
  setFleetServiceActive,
} from '../../../services/fleetServicesService'
import type { FleetService } from '../../../services/fleetServicesService'
import { readServiceErrorMessage, reconcileStatusOutcome } from './serviceHelpers'

export interface ServiceStatusDialogProps {
  api: ApiRequest
  service: FleetService
  onServiceRefreshed: (service: FleetService) => void
  onSaved: (service: FleetService) => void
  onCancel: () => void
}

/** Diálogo de confirmação para ativação ou inativação de tipo de serviço com foco acessível e reconciliação. */
export default function ServiceStatusDialog({
  api,
  service,
  onServiceRefreshed,
  onSaved,
  onCancel,
}: ServiceStatusDialogProps) {
  const [currentService, setCurrentService] = useState<FleetService>(service)
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState<string | undefined>()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [needsReconciliation, setNeedsReconciliation] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const reasonInputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const submittingRef = useRef(false)
  const nextActive = !currentService.active

  async function consultCurrentState(): Promise<'proceed' | 'completed' | 'stop'> {
    try {
      const services = await listFleetServices(api)
      const outcome = reconcileStatusOutcome(services, currentService.id, currentService.revision, nextActive)
      setNeedsReconciliation(false)
      if (outcome.kind === 'not-found') {
        setSubmitError('Este tipo de serviço não foi encontrado no servidor.')
        return 'stop'
      }
      setCurrentService(outcome.service)
      onServiceRefreshed(outcome.service)
      if (outcome.kind === 'status-confirmed') {
        onSaved(outcome.service)
        return 'completed'
      }
      if (outcome.kind === 'concurrent-change') {
        setSubmitError(`O tipo de serviço foi alterado por outra operação (revisão ${outcome.service.revision}). Confira a situação atual antes de confirmar.`)
        return 'stop'
      }
      setSubmitError('Confirmamos no servidor que a situação ainda não foi alterada. Tente confirmar novamente.')
      return 'proceed'
    } catch (error) {
      setNeedsReconciliation(true)
      setSubmitError(`Não foi possível consultar o estado atual: ${readServiceErrorMessage(error, 'falha de comunicação')}.`)
      return 'stop'
    }
  }

  async function handleConfirm() {
    if (submittingRef.current) return
    if (needsReconciliation) {
      submittingRef.current = true
      setSubmitting(true)
      const result = await consultCurrentState()
      submittingRef.current = false
      setSubmitting(false)
      if (result !== 'proceed') return
    }

    if (!reason.trim()) {
      setReasonError('Informe a justificativa da mudança de situação.')
      reasonInputRef.current?.focus()
      return
    }

    submittingRef.current = true
    setSubmitting(true)
    setSubmitError(null)
    try {
      const updated = await setFleetServiceActive(api, currentService, nextActive, reason.trim())
      onSaved(updated)
    } catch (error) {
      if (isUncertainServiceError(error)) {
        const result = await consultCurrentState()
        if (result === 'completed') return
      } else {
        setSubmitError(readServiceErrorMessage(error, 'Não foi possível alterar a situação do tipo de serviço.'))
      }
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  return (
    <ConfirmDialog
      open
      title={`${nextActive ? 'Ativar' : 'Inativar'} tipo de serviço`}
      description={nextActive
        ? `Deseja ativar “${currentService.name}”? O tipo ficará disponível para novas solicitações.`
        : `Deseja inativar “${currentService.name}”? O tipo deixará de aparecer em novas solicitações; registros existentes serão preservados.`}
      confirmLabel={needsReconciliation ? 'Consultar e continuar' : nextActive ? 'Ativar tipo' : 'Inativar tipo'}
      danger={!nextActive}
      onConfirm={() => void handleConfirm()}
      onCancel={onCancel}
      cancelLabel="Manter situação atual"
      loading={submitting}
      confirmDisabled={submitting}
      onEntered={() => reasonInputRef.current?.focus()}
      sx={accessibleControls}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
        {submitError && (
          <Alert
            severity="error"
            role="alert"
            action={needsReconciliation ? (
              <Button color="inherit" size="small" disabled={submitting} onClick={() => void consultCurrentState()}>
                Consultar estado atual
              </Button>
            ) : undefined}
          >
            {submitError}
          </Alert>
        )}
        <FormField
          label="Justificativa"
          value={reason}
          onChange={(nextReason) => {
            setReason(nextReason)
            setReasonError(undefined)
          }}
          error={reasonError}
          helperText="Registrada na auditoria do tipo de serviço."
          required
          multiline
          minRows={2}
          autoFocus
          inputRef={reasonInputRef}
        />
      </Box>
    </ConfirmDialog>
  )
}
