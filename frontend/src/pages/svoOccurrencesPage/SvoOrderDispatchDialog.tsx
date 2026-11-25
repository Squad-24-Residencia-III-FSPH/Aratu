import { useEffect, useId, useRef } from 'react'
import type { FormEvent } from 'react'
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material'
import { accessibleControls } from '../../components/ui/accessibleControls'
import { FormSelect } from '../../components/ui/FormField'
import StateFeedback from '../../components/ui/StateFeedback'
import type { DispatchOrderDraft, DispatchOrderField } from '../../hooks/useSvoOccurrences'
import { SVO_REQUESTER_TYPE_LABELS } from '../../types/svoOccurrence'

/** Propriedades do diálogo de despacho e geração de ordem SVO (FROTA-116). */
export interface SvoOrderDispatchDialogProps {
  /** Rascunho do despacho e candidatos consultados em `GET /svo/dispatch-candidates`. */
  draft: DispatchOrderDraft
  /** Indica envio em curso para impedir submissões concorrentes. */
  submitting: boolean
  /** Indica consulta de reconciliação em andamento após falha incerta. */
  reconciling: boolean
  /** Atualiza os campos selecionados do despacho. */
  onChange: (patch: Partial<Pick<DispatchOrderDraft, 'teamId' | 'vehicleId'>>) => void
  /** Reconsulta equipes ativas e viaturas elegíveis no servidor. */
  onReloadCandidates: () => void
  /** Submete `POST /svo/orders` e retorna o primeiro campo inválido para foco. */
  onSubmit: () => Promise<DispatchOrderField | null>
  /** Consulta `GET /svo/orders` quando o resultado da geração é incerto. */
  onReconcile: () => void
  /** Fecha o diálogo devolvendo o foco ao acionador. */
  onClose: () => void
}

/**
 * Diálogo operacional para gerar uma ordem de execução SVO (`POST /svo/orders`)
 * a partir de uma solicitação confirmada, selecionando equipe ativa e viatura elegível.
 */
export default function SvoOrderDispatchDialog({
  draft,
  submitting,
  reconciling,
  onChange,
  onReloadCandidates,
  onSubmit,
  onReconcile,
  onClose,
}: SvoOrderDispatchDialogProps) {
  const titleId = useId()
  const descId = useId()
  const teamBoxRef = useRef<HTMLDivElement>(null)
  const vehicleBoxRef = useRef<HTMLDivElement>(null)
  const busy = submitting || reconciling

  const teamOptions = draft.teams.map((team) => ({
    value: team.id,
    label: team.name,
  }))

  const eligibleVehicles = draft.vehicles.filter((vehicle) => vehicle.availableSlots > 0)
  const vehicleOptions = eligibleVehicles.map((vehicle) => {
    const modelLabel = [vehicle.brand, vehicle.model].filter(Boolean).join(' ')
    const suffix = modelLabel ? ` · ${modelLabel}` : ''
    return {
      value: vehicle.id,
      label: `${vehicle.plate}${suffix} (${vehicle.occupyingOrders}/${vehicle.bodyLimit} ocupadas · ${vehicle.availableSlots} ${vehicle.availableSlots === 1 ? 'vaga' : 'vagas'})`,
    }
  })

  const hasTeams = teamOptions.length > 0
  const hasVehicles = eligibleVehicles.length > 0
  const canSelectCandidates = !draft.candidatesLoading && !draft.candidatesError && hasTeams && hasVehicles

  useEffect(() => {
    if (!canSelectCandidates) return
    const frame = requestAnimationFrame(() => {
      teamBoxRef.current?.querySelector<HTMLElement>('[role="combobox"]')?.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [canSelectCandidates])

  function focusField(field: DispatchOrderField) {
    const container = field === 'teamId' ? teamBoxRef.current : vehicleBoxRef.current
    container?.querySelector<HTMLElement>('[role="combobox"]')?.focus()
  }

  async function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const invalidField = await onSubmit()
    if (invalidField) {
      requestAnimationFrame(() => focusField(invalidField))
    }
  }

  return (
    <Dialog
      open
      onClose={busy ? undefined : onClose}
      fullWidth
      maxWidth="sm"
      aria-labelledby={titleId}
      aria-describedby={descId}
      sx={accessibleControls}
    >
      <DialogTitle id={titleId}>Gerar ordem SVO · Solicitação #{draft.occurrence.id}</DialogTitle>
      <Box component="form" noValidate onSubmit={handleFormSubmit}>
        <DialogContent dividers sx={{ overflowWrap: 'anywhere' }}>
          <Typography id={descId} variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Solicitação confirmada ({SVO_REQUESTER_TYPE_LABELS[draft.occurrence.requesterType]}) · Local: {draft.occurrence.location}
          </Typography>

          {draft.candidatesLoading ? (
            <StateFeedback kind="loading" title="Consultando equipes ativas e viaturas SVO elegíveis..." />
          ) : draft.candidatesError ? (
            <StateFeedback
              kind="error"
              title="Não foi possível carregar os candidatos de despacho."
              description={draft.candidatesError}
              actionLabel="Tentar novamente"
              onAction={onReloadCandidates}
            />
          ) : !hasTeams || !hasVehicles ? (
            <StateFeedback
              kind="empty"
              title={
                !hasTeams && !hasVehicles
                  ? 'Nenhuma equipe ativa e nenhuma viatura SVO elegível no momento.'
                  : !hasTeams
                    ? 'Nenhuma equipe SVO ativa disponível no momento.'
                    : 'Nenhuma viatura SVO com vaga disponível no momento.'
              }
              description={
                !hasTeams
                  ? 'Verifique o cadastro de equipes SVO ativas antes de gerar a ordem.'
                  : 'Nenhuma viatura disponível para operação SVO e transporte de corpos possui vaga livre ou está liberada sem manutenção impeditiva.'
              }
              actionLabel="Atualizar candidatos"
              onAction={onReloadCandidates}
            />
          ) : (
            <Stack spacing={2}>
              <Box ref={teamBoxRef}>
                <FormSelect
                  label="Equipe SVO ativa"
                  required
                  value={draft.teamId}
                  emptyLabel="Selecione a equipe"
                  displayEmpty
                  disabled={busy || draft.blocked || draft.uncertain}
                  error={draft.fieldErrors.teamId}
                  helperText="Equipes ativas habilitadas para atendimento SVO."
                  options={teamOptions}
                  onChange={(value) => onChange({ teamId: value })}
                />
              </Box>
              <Box ref={vehicleBoxRef}>
                <FormSelect
                  label="Viatura SVO disponível"
                  required
                  value={draft.vehicleId}
                  emptyLabel="Selecione a viatura"
                  displayEmpty
                  disabled={busy || draft.blocked || draft.uncertain}
                  error={draft.fieldErrors.vehicleId}
                  helperText="Exibe viaturas disponíveis (operação SVO, transporte de corpos, sem manutenção impeditiva) e vagas livres."
                  options={vehicleOptions}
                  onChange={(value) => onChange({ vehicleId: value })}
                />
              </Box>
              <Box>
                <Button type="button" size="small" color="inherit" disabled={busy || draft.candidatesLoading} onClick={onReloadCandidates}>
                  Atualizar candidatos
                </Button>
              </Box>
            </Stack>
          )}

          {draft.error && (
            <Alert severity={draft.uncertain ? 'warning' : 'error'} role="alert" sx={{ mt: 2 }}>
              {draft.error}
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, flexWrap: 'wrap', gap: 1 }}>
          <Button type="button" color="inherit" disabled={busy} onClick={onClose}>
            Voltar
          </Button>
          {draft.uncertain ? (
            <Button
              type="button"
              variant="contained"
              disabled={busy}
              aria-busy={reconciling ? 'true' : undefined}
              onClick={onReconcile}
            >
              {reconciling ? 'Consultando...' : 'Consultar situação'}
            </Button>
          ) : (
            <Button
              type="submit"
              variant="contained"
              disabled={busy || draft.blocked || !canSelectCandidates}
              aria-busy={submitting ? 'true' : undefined}
            >
              {submitting ? 'Gerando ordem...' : 'Gerar ordem'}
            </Button>
          )}
        </DialogActions>
      </Box>
    </Dialog>
  )
}
